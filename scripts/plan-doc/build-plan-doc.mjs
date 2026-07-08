// Maintains the repo's implementation plan from issue activity, incrementally.
//
// graph.json is the persisted source of truth: an array of nodes, one per
// issue, carrying the derived blocker/conflict structure. GRAPH.md and READY.md
// are always fully re-rendered deterministically from graph.json (pure JSON ->
// markdown, no model call in the render path).
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
// CI-only tooling: standalone Node ESM with its own package.json, deliberately
// NOT part of the bun workspace (it carries @anthropic-ai/sdk, which the rest
// of the repo does not).

import Anthropic from "@anthropic-ai/sdk";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const GRAPH_FILE = "graph.json";
const ISSUE_FIELDS = "number,title,body,state,labels,url";

// Issues carrying any of these labels are never "ready to code" candidates,
// regardless of what other labels (v0, v1, v2, ...) exist alongside them.
// Blacklist, not whitelist -- new version/scope labels show up automatically.
const EXCLUDED_LABELS = new Set([
  "duplicate",
  "invalid",
  "wontfix",
  "question",
  "discussion",
  "needs-triage",
  "blocked-external",
  "icebox",
]);

// One node's derived structure. status "unknown" is the placeholder state for a
// referenced-but-not-yet-indexed issue; it is filled in properly once that
// issue's own event fires. `labels` is attached by the script from the fetched
// gh data (not the model) so READY.md's EXCLUDED_LABELS filter and label
// display keep working on the incremental path without re-fetching every issue.
const NODE_PROPERTIES = {
  number: { type: "integer" },
  title: { type: "string" },
  status: { type: "string", enum: ["open", "closed", "unknown"] },
  blocked_by: { type: "array", items: { type: "integer" } },
  conflict_risk_with: { type: "array", items: { type: "integer" } },
  conflict_reason: { type: "string" },
};
const NODE_ITEM = {
  type: "object",
  properties: NODE_PROPERTIES,
  required: ["number", "title", "status", "blocked_by", "conflict_risk_with"],
  additionalProperties: false,
};
const NODES_SCHEMA = {
  type: "object",
  properties: { nodes: { type: "array", items: NODE_ITEM } },
  required: ["nodes"],
  additionalProperties: false,
};

const client = new Anthropic();

/** Runs `gh` and returns its parsed JSON stdout. */
function gh(args) {
  return JSON.parse(execFileSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }));
}

/** Attaches label names from a fetched issue onto its derived node, in place. */
function attachLabels(node, issue) {
  node.labels = (issue?.labels ?? []).map((l) => l.name);
  return node;
}

async function deriveNodes(promptContent) {
  const response = await client.messages.parse({
    model: "claude-opus-4-8",
    max_tokens: 8000,
    output_config: { effort: "high", format: { type: "json_schema", schema: NODES_SCHEMA } },
    messages: [{ role: "user", content: promptContent }],
  });
  return response.parsed_output.nodes;
}

/** First-run backfill: fetch every issue and derive the whole graph once. */
async function bootstrap() {
  const issues = gh(["issue", "list", "--state", "all", "--limit", "500", "--json", ISSUE_FIELDS]);
  const issueByNumber = new Map(issues.map((i) => [i.number, i]));
  const nodes = await deriveNodes(
    `Given these GitHub issues, extract a blocker dependency graph and flag pairs likely to conflict on merge (same files/subsystem implied by the descriptions). Issues:\n\n${
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
  const issue = gh(["issue", "view", String(issueNumber), "--json", ISSUE_FIELDS]);
  const returned = await deriveNodes(
    `You maintain a persisted blocker dependency graph for a repo's issues. Here is the current graph:\n\n${
      JSON.stringify(graph, null, 2)
    }\n\nOne issue just changed. Return ONLY the upserted node(s): the recomputed node for this issue (its blocked_by / conflict_risk_with / conflict_reason derived from its current body and labels against the graph above), plus minimal placeholder nodes for any issue numbers it references that are not already in the graph -- placeholders are {number, title: "(not yet indexed)", status: "unknown", blocked_by: [], conflict_risk_with: []}. Do not return any other existing nodes. The changed issue:\n\n${
      JSON.stringify(issue, null, 2)
    }`,
  );

  const byNumber = new Map(graph.nodes.map((n) => [n.number, n]));
  for (const node of returned) {
    const existing = byNumber.get(node.number);
    // Never let a placeholder clobber an already-indexed node.
    if (node.status === "unknown" && existing) {
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

function renderGraph({ nodes }) {
  const lines = ["# Dependency graph\n", "```mermaid", "graph TD"];
  for (const n of nodes) {
    for (const b of n.blocked_by) {
      lines.push(`  ${b} --> ${n.number}`);
    }
  }
  lines.push("```\n", "## Merge conflict risks\n");
  for (const n of nodes) {
    if (n.conflict_risk_with.length) {
      lines.push(`- #${n.number} vs ${n.conflict_risk_with.map((x) => `#${x}`).join(", ")} — ${n.conflict_reason}`);
    }
  }
  return lines.join("\n");
}

function renderReady({ nodes }) {
  const byNumber = new Map(nodes.map((n) => [n.number, n]));
  const lines = ["# Ready to code\n"];
  for (const n of nodes) {
    if (n.status !== "open") {
      continue;
    }
    const unresolvedBlockers = n.blocked_by.filter((b) => byNumber.get(b)?.status === "open");
    if (unresolvedBlockers.length) {
      continue;
    }
    const labels = n.labels ?? [];
    if (labels.some((l) => EXCLUDED_LABELS.has(l))) {
      continue;
    }
    lines.push(`- #${n.number} — ${n.title}${labels.length ? ` (${labels.join(", ")})` : ""}`);
  }
  return lines.join("\n");
}

const graph = existsSync(GRAPH_FILE)
  ? await incremental(JSON.parse(readFileSync(GRAPH_FILE, "utf8")), process.env.ISSUE_NUMBER)
  : { nodes: await bootstrap() };

writeFileSync(GRAPH_FILE, `${JSON.stringify(graph, null, 2)}\n`);
writeFileSync("GRAPH.md", renderGraph(graph));
writeFileSync("READY.md", renderReady(graph));
