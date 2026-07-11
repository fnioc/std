// Maintains the repo's implementation plan from issue activity, incrementally.
//
// graph.json is the persisted source of truth: an array of nodes, one per
// issue, carrying the derived blocker/conflict structure. ready.json is the
// derived "ready to code" slice, recomputed deterministically from graph.json
// each run (no model call in that path). Both are compact JSON consumed by an
// automated monitor, not rendered markdown for a human.
//
// Two flows, chosen by whether graph.json already exists:
//
//   - Bootstrap (first run ever, graph.json missing): fetch the whole issue set
//     ONCE and ask Claude to derive the initial graph from scratch. This is the
//     only time the full issue set is fetched or sent to the model.
//   - Incremental (graph.json exists): fetch only the triggering issue
//     (ISSUE_NUMBER) and ask Claude to return just the upserted node(s) -- the
//     recomputed node for that issue plus placeholder nodes for any issue it
//     references that isn't indexed yet. Merge those into graph.json by number,
//     leaving every other node untouched. A single issue mutating never
//     re-derives the whole graph.
//
// CI-only tooling: standalone Node ESM, deliberately NOT part of the bun
// workspace. It has no npm dependencies -- it shells out to `git`, `gh`, and
// the `claude` CLI only.
//
// Model calls go through `claude -p` (not the SDK / raw Messages API) so the
// builder authenticates with a Claude Code OAuth token (CLAUDE_CODE_OAUTH_TOKEN,
// the same subscription auth the drainer workers use). The raw API 429s that
// token; `claude -p` accepts it.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const GRAPH_FILE = 'graph.json';
const ISSUE_FIELDS = 'number,title,body,state,labels,url';

// An issue reaches the ready list only if it carries BOTH of these -- the
// repo's coding gate (CLAUDE.md): `signoff` (owner's go-ahead) and
// `claude-ready` (finishable unattended). Removing `claude-ready` is therefore
// how a worker takes a blocked issue back off the list without touching the
// graph. This is the one whitelist requirement; scope/version labels stay
// governed by the blacklist below.
const REQUIRED_LABELS = ['signoff', 'claude-ready'];

// Issues carrying any of these labels are never "ready to code" candidates,
// regardless of what other labels (v0, v1, v2, ...) exist alongside them.
// Blacklist, not whitelist -- new version/scope labels show up automatically.
const EXCLUDED_LABELS = new Set([
  'duplicate',
  'invalid',
  'wontfix',
  'question',
  'discussion',
  'needs-triage',
  'blocked-external',
  'icebox',
]);

// One node's derived structure. status "unknown" is the placeholder state for a
// referenced-but-not-yet-indexed issue; it is filled in properly once that
// issue's own event fires. `labels` is attached by the script from the fetched
// gh data (not the model) so ready.json's EXCLUDED_LABELS filter and label
// output keep working on the incremental path without re-fetching every issue.
const NODE_PROPERTIES = {
  number: { type: 'integer' },
  title: { type: 'string' },
  status: { type: 'string', enum: ['open', 'closed', 'unknown'] },
  blocked_by: { type: 'array', items: { type: 'integer' } },
  conflict_risk_with: { type: 'array', items: { type: 'integer' } },
  conflict_reason: { type: 'string' },
};
const NODE_ITEM = {
  type: 'object',
  properties: NODE_PROPERTIES,
  required: ['number', 'title', 'status', 'blocked_by', 'conflict_risk_with'],
  additionalProperties: false,
};
const NODES_SCHEMA = {
  type: 'object',
  properties: { nodes: { type: 'array', items: NODE_ITEM } },
  required: ['nodes'],
  additionalProperties: false,
};

// A compact, human-readable rendering of NODES_SCHEMA to embed in prompts. The
// `claude` CLI can't enforce a response schema (no `output_config.format`), so
// the shape has to travel in the prompt text and be parsed defensively.
const SCHEMA_HINT = JSON.stringify(NODES_SCHEMA);

const JSON_ONLY_INSTRUCTION =
  `Respond with ONLY valid minified JSON matching this exact schema -- no prose, no explanation, no markdown code fences:\n${SCHEMA_HINT}`;

/** Runs `gh` and returns its parsed JSON stdout. */
function gh(args) {
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

/** Attaches label names from a fetched issue onto its derived node, in place. */
function attachLabels(node, issue) {
  node.labels = (issue?.labels ?? []).map((l) => l.name);
  return node;
}

/**
 * Extracts the model's JSON payload from a `claude -p` text result. The CLI has
 * no structured-output enforcement, so the result may arrive wrapped in prose or
 * a markdown fence -- strip any ```json/``` fence, then take the substring from
 * the first `{` to the last `}` before parsing.
 */
function extractJson(result) {
  const unfenced = result.replace(/```(?:json)?/gi, '').trim();
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`no JSON object found in model result: ${result.slice(0, 500)}`);
  }
  const slice = unfenced.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (err) {
    throw new Error(`failed to parse model JSON (${err.message}): ${slice.slice(0, 500)}`);
  }
}

/**
 * Derives nodes by driving the `claude` CLI (`claude -p`), authenticated by
 * CLAUDE_CODE_OAUTH_TOKEN in the environment. No tools are needed for pure
 * generation; bypassPermissions avoids any interactive prompt. --max-turns is
 * deliberately unset -- a low cap could truncate a large generation.
 *
 * The prompt is fed on stdin, not as an argv element: the bootstrap prompt
 * embeds the whole issue set and blows past ARG_MAX as a command argument
 * (spawn E2BIG). `claude -p` reads the prompt from stdin when none is given.
 */
function deriveNodes(promptContent) {
  const stdout = execFileSync(
    'claude',
    ['-p', '--output-format', 'json', '--permission-mode', 'bypassPermissions'],
    { input: promptContent, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 300000 },
  );
  const run = JSON.parse(stdout);
  if (run.is_error || run.subtype !== 'success') {
    throw new Error(
      `claude -p failed (subtype: ${run.subtype}, is_error: ${run.is_error}): ${
        run.result ?? run.error ?? '(no error text)'
      }`,
    );
  }
  return extractJson(run.result).nodes;
}

/** First-run backfill: fetch every issue and derive the whole graph once. */
async function bootstrap() {
  const issues = gh(['issue', 'list', '--state', 'all', '--limit', '500', '--json', ISSUE_FIELDS]);
  const issueByNumber = new Map(issues.map((i) => [i.number, i]));
  const nodes = deriveNodes(
    `Given these GitHub issues, extract a blocker dependency graph and flag pairs likely to conflict on merge (same files/subsystem implied by the descriptions). ${JSON_ONLY_INSTRUCTION}\n\nIssues:\n\n${
      JSON.stringify(issues, null, 2)
    }`,
  );
  for (const node of nodes) {
    attachLabels(node, issueByNumber.get(node.number));
  }
  return nodes;
}

/**
 * Incremental update: re-derive only the triggering issue's node (plus
 * placeholders for anything it newly references) against the existing graph,
 * and merge the result in by number.
 */
async function incremental(graph, issueNumber) {
  const issue = gh(['issue', 'view', String(issueNumber), '--json', ISSUE_FIELDS]);
  const returned = deriveNodes(
    `You maintain a persisted blocker dependency graph for a repo's issues. Here is the current graph:\n\n${
      JSON.stringify(graph, null, 2)
    }\n\nOne issue just changed. Return ONLY the upserted node(s): the recomputed node for this issue (its blocked_by / conflict_risk_with / conflict_reason derived from its current body and labels against the graph above), plus minimal placeholder nodes for any issue numbers it references that are not already in the graph -- placeholders are {number, title: "(not yet indexed)", status: "unknown", blocked_by: [], conflict_risk_with: []}. Do not return any other existing nodes. ${JSON_ONLY_INSTRUCTION}\n\nThe changed issue:\n\n${
      JSON.stringify(issue, null, 2)
    }`,
  );

  const byNumber = new Map(graph.nodes.map((n) => [n.number, n]));
  for (const node of returned) {
    const existing = byNumber.get(node.number);
    // Never let a placeholder clobber an already-indexed node.
    if (node.status === 'unknown' && existing) {
      continue;
    }
    if (node.number === issue.number) {
      attachLabels(node, issue);
    } else {
      node.labels = existing?.labels ?? [];
    }
    byNumber.set(node.number, node);
  }
  return { nodes: [...byNumber.values()] };
}

/**
 * The "ready to code" slice: open issues with no unresolved blocker (a blocker
 * is unresolved while its own node is still open), carrying both REQUIRED_LABELS
 * and no excluded label. Output is consumed by an automated monitor, not a
 * human, so it's a JSON array of {number, title, labels} -- not rendered
 * markdown.
 */
function computeReady({ nodes }) {
  const byNumber = new Map(nodes.map((n) => [n.number, n]));
  const ready = [];
  for (const n of nodes) {
    if (n.status !== 'open') {
      continue;
    }
    const unresolvedBlockers = n.blocked_by.filter((b) => byNumber.get(b)?.status === 'open');
    if (unresolvedBlockers.length) {
      continue;
    }
    const labels = n.labels ?? [];
    if (!REQUIRED_LABELS.every((r) => labels.includes(r))) {
      continue;
    }
    if (labels.some((l) => EXCLUDED_LABELS.has(l))) {
      continue;
    }
    ready.push({ number: n.number, title: n.title, labels });
  }
  return ready;
}

const graph = existsSync(GRAPH_FILE)
  ? await incremental(JSON.parse(readFileSync(GRAPH_FILE, 'utf8')), process.env.ISSUE_NUMBER)
  : { nodes: await bootstrap() };

// Compact JSON -- both files are read by Claude, not skimmed by a human, so the
// pretty-print whitespace isn't worth its tokens.
writeFileSync(GRAPH_FILE, JSON.stringify(graph));
writeFileSync('ready.json', JSON.stringify(computeReady(graph)));
