// Rebuilds GRAPH.md + READY.md from the repo's issues on every trigger (full
// rebuild, not incremental patching -- simpler and drift-free). Reads
// issues.json (produced by `gh issue list` in the workflow), asks Claude to
// extract a blocker dependency graph plus likely merge-conflict pairs, then
// renders two docs:
//   - GRAPH.md -- a mermaid blocker graph + the merge-conflict-risk list.
//   - READY.md -- a flat "ready to code" list (open issues with no unresolved
//     blockers and no excluded label).
//
// CI-only tooling: standalone Node ESM with its own package.json, deliberately
// NOT part of the bun workspace (it carries @anthropic-ai/sdk, which the rest
// of the repo does not).

import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, writeFileSync } from "node:fs";

const client = new Anthropic();
const issues = JSON.parse(readFileSync("issues.json", "utf8"));
const issueByNumber = new Map(issues.map((i) => [i.number, i]));

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

const GRAPH_SCHEMA = {
  type: "object",
  properties: {
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          number: { type: "integer" },
          title: { type: "string" },
          status: { type: "string", enum: ["open", "closed"] },
          blocked_by: { type: "array", items: { type: "integer" } },
          conflict_risk_with: { type: "array", items: { type: "integer" } },
          conflict_reason: { type: "string" },
        },
        required: ["number", "title", "status", "blocked_by", "conflict_risk_with"],
        additionalProperties: false,
      },
    },
  },
  required: ["nodes"],
  additionalProperties: false,
};

const response = await client.messages.parse({
  model: "claude-opus-4-8",
  max_tokens: 8000,
  output_config: { effort: "high", format: { type: "json_schema", schema: GRAPH_SCHEMA } },
  messages: [{
    role: "user",
    content:
      `Given these GitHub issues, extract a blocker dependency graph and flag pairs likely to conflict on merge (same files/subsystem implied by the descriptions). Issues:\n\n${
        JSON.stringify(issues, null, 2)
      }`,
  }],
});

const graph = response.parsed_output;
writeFileSync("GRAPH.md", renderGraph(graph));
writeFileSync("READY.md", renderReady(graph));

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
    const labels = (issueByNumber.get(n.number)?.labels ?? []).map((l) => l.name);
    if (labels.some((l) => EXCLUDED_LABELS.has(l))) {
      continue;
    }
    lines.push(`- #${n.number} — ${n.title}${labels.length ? ` (${labels.join(", ")})` : ""}`);
  }

  return lines.join("\n");
}
