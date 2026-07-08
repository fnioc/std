#!/usr/bin/env node
// Deterministic queue drainer -- keeps one plan-issue-worker running per ready
// issue. This SCRIPT replaces the former haiku `plan-queue-monitor` agent: the
// dispatcher's job is purely mechanical (poll a queue file, dedup, spawn/reap
// workers), so tracking real child-process handles is strictly more reliable
// than an LLM re-deriving in-flight state from working memory every cycle. The
// *worker* stays an LLM (it does real code implementation); only the dispatcher
// is now a script.
//
// The queue is `ready.json` on the `bot/plan-doc` branch (maintained by the
// plan-doc GitHub Action): a JSON array of {number, title, labels} for issues
// that are ready to code right now. We poll it and reconcile.
//
// Dedup model -- three structures:
//
//   - `active`: Map<number, ChildProcess>. Issues with a currently-running
//     worker. Populated on spawn, pruned in the child's `exit` handler. Because
//     it holds real process handles, "is #N being worked?" is a fact, not a
//     guess.
//   - `handled`: Set<number>. Issues whose worker ended with a `success`
//     result but which are still present in ready.json because the removal
//     hasn't propagated yet (merge -> issue event -> plan-doc rebuild -> branch
//     push has lag). Prevents relaunching a just-completed issue during that lag.
//   - `quarantined`: Set<number>. Issues whose worker ended in ANY error
//     outcome (turn cap hit, execution error, crash). In-memory only and never
//     relaunched for the rest of this drainer session -- restarting the drainer
//     clears it. This is the human-in-the-loop recovery: a stuck issue waits for
//     a human to notice and restart rather than looping all night. There is
//     deliberately NO auto-retry.
//
//   Spawn iff `!active.has(n) && !handled.has(n) && !quarantined.has(n)`,
//   subject to the optional launch-time label filter. There is deliberately no
//   concurrency ceiling -- the drainer fans out a worker for every eligible
//   ready issue; the per-worker `--max-turns` cap is the runaway guard.
//
// Live narration + outcome: workers run with `--output-format stream-json
// --verbose`, emitting newline-delimited JSON events. We line-buffer stdout and
// print ONE concise, color-coded line per meaningful event (assistant text, tool
// use, the terminal result) prefixed with `[#<issue>]`, so the console shows what
// each worker is doing right now. The terminal `result` event carries the outcome
// -- `subtype`/`is_error`/`total_cost_usd`. `success` -> handled; any `error_*`
// subtype -> quarantine. A stream that ends WITHOUT a terminal result (crash /
// killed / non-zero exit) is treated as an error -> quarantine. Exit code is NOT
// authoritative (a run that hits `--max-turns` still exits 0).
//
// Shutdown caveat: workers are attached child processes, so stopping the
// drainer (Ctrl-C / SIGINT) terminates any in-flight workers. A clean stop is
// Ctrl-C when nothing is active.

import { execFile, spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// scripts/plan-doc/ -> repo root two levels up. Workers spawn with this cwd.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const POLL_MS = 60_000;
// Per-worker turn cap -- the runaway backstop. `claude -p --max-turns N` is a
// real (if undocumented) flag; when a run hits it the process still exits 0 and
// the terminal result carries `subtype: "error_max_turns"`, which quarantines
// the issue. Overridable via DRAIN_MAX_TURNS.
const MAX_TURNS = Number(process.env.DRAIN_MAX_TURNS) || 200;

// Optional launch-time label filter: a comma-separated list forwarded as the
// first positional arg (`drain v0` / `drain v0,v1`). When set, an issue is
// eligible only if its `labels` intersect this set (any-match). Empty => no
// filter, every ready issue is eligible.
const LABEL_FILTER = new Set(
  (process.argv[2] ?? "")
    .split(",")
    .map((label) => label.trim())
    .filter((label) => label.length > 0),
);

// Per-worker console colors (256-color ANSI). Hand-picked to be mutually
// high-contrast AND legible on both dark and light terminals: saturated
// mid-tones only -- no pure black/white, no dim gray, no pale last-row cube
// colors (which vanish on white), no near-duplicate hues. Ordered so adjacent
// assignments differ strongly: blue, orange, green, orchid, teal, rust, violet,
// rose, gold, spring-green, magenta, sky. When more workers are active than the
// palette has entries, colors repeat (cycle) -- the `[#<issue>]` prefix on every
// line is what guarantees disambiguation regardless.
const PALETTE = [33, 208, 34, 170, 37, 130, 99, 168, 178, 42, 201, 45];

/** issue number -> its running worker process. Pruned on child exit. */
const active = new Map();
/** issue numbers whose worker succeeded; held until the queue line clears. */
const handled = new Set();
/** issue numbers whose worker errored; never relaunched this session. */
const quarantined = new Set();

/** Colors currently free for assignment (starts as a copy of the palette). */
const freeColors = [...PALETTE];
/** issue number -> { code, pooled } assigned color state. */
const workerColor = new Map();
/** Round-robin index used only when the palette is exhausted (overflow). */
let overflow = 0;

function assignColor(n) {
  if (freeColors.length > 0) {
    const code = freeColors.shift();
    workerColor.set(n, { code, pooled: true });
    return;
  }
  // Palette exhausted: cycle a color (reused, not returned to the pool).
  const code = PALETTE[overflow++ % PALETTE.length];
  workerColor.set(n, { code, pooled: false });
}

function releaseColor(n) {
  const c = workerColor.get(n);
  if (!c) {
    return;
  }
  workerColor.delete(n);
  if (c.pooled) {
    freeColors.push(c.code);
  }
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/** One color-coded, `[#n]`-prefixed activity line for worker #n. */
function workerLog(n, msg) {
  const code = workerColor.get(n)?.code ?? 7;
  console.log(`\x1b[38;5;${code}m[#${n}] ${msg}\x1b[0m`);
}

function collapse(s) {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function clip(s, max) {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function firstLine(s) {
  return collapse(String(s ?? "").split("\n")[0]);
}

/** A short human summary of a tool_use block's target, per tool. */
function toolArg(block) {
  const input = block.input ?? {};
  switch (block.name) {
    case "Bash":
      return clip(firstLine(input.command), 100);
    case "Edit":
    case "Write":
    case "Read":
    case "NotebookEdit":
      return clip(collapse(input.file_path), 100);
    case "Task": {
      const who = input.subagent_type ? `(${input.subagent_type}) ` : "";
      return clip(who + collapse(input.description), 100);
    }
    case "Workflow":
      return clip(collapse(input.description ?? input.prompt), 100);
    default:
      return "";
  }
}

/**
 * Narrate one parsed stream event as a single worker line. Terminal `result`
 * events are handled by the caller (settleFromResult); everything else is pure
 * console narration. system/rate_limit/thinking blocks are intentionally silent.
 */
function narrateEvent(n, ev) {
  if (ev.type === "assistant") {
    const content = ev.message?.content;
    if (!Array.isArray(content)) {
      return;
    }
    for (const block of content) {
      if (block.type === "text") {
        const text = clip(collapse(block.text), 118);
        if (text) {
          workerLog(n, text);
        }
      } else if (block.type === "tool_use") {
        const arg = toolArg(block);
        workerLog(n, `→ ${block.name}${arg ? ` ${arg}` : ""}`);
      }
    }
    return;
  }
  if (ev.type === "user") {
    const content = ev.message?.content;
    if (!Array.isArray(content)) {
      return;
    }
    for (const block of content) {
      // Only surface tool FAILURES; successful results would be pure noise.
      if (block.type === "tool_result" && block.is_error) {
        workerLog(n, "  ✗ tool error");
      }
    }
  }
}

/** Format a result's cost as `$x.xxxx` or `n/a`. */
function fmtCost(result) {
  return result && typeof result.total_cost_usd === "number"
    ? `$${result.total_cost_usd.toFixed(4)}`
    : "n/a";
}

/** Decide outcome from the terminal `result` event. */
function settleFromResult(n, result) {
  const cost = fmtCost(result);
  const subtype = typeof result.subtype === "string" ? result.subtype : "(missing subtype)";

  if (subtype === "success") {
    // Success: hold the issue in `handled` until its line clears from the queue,
    // so the propagation lag doesn't relaunch a completed worker.
    handled.add(n);
    workerLog(n, `✓ done (success; cost ${cost}); awaiting removal from queue`);
    return;
  }

  // Any recognized error_* subtype, or an unrecognized shape: quarantine. Log
  // the raw result on an unexpected subtype so a new CLI shape is diagnosable.
  quarantined.add(n);
  workerLog(n, `✗ ${subtype} (cost ${cost}); QUARANTINED (no relaunch this session)`);
  if (!subtype.startsWith("error")) {
    log(`  #${n} unrecognized result shape: ${JSON.stringify(result).slice(-2000)}`);
  }
}

/** Spawn a worker for issue #n, wiring the child's stream into narration. */
function spawnWorker(n) {
  const prompt = `You are the plan-issue-worker for issue #${n} in this repository. `
    + `Read .claude/agents/plan-issue-worker.md and follow it exactly to drain issue #${n}. `
    + `Do the work autonomously; do not ask questions.`;

  const child = spawn(
    "claude",
    [
      "-p",
      prompt,
      "--permission-mode",
      "bypassPermissions",
      "--output-format",
      "stream-json",
      "--verbose",
      "--max-turns",
      String(MAX_TURNS),
    ],
    { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );

  active.set(n, child);
  assignColor(n);
  log(`spawn worker for #${n} (pid ${child.pid}, max-turns ${MAX_TURNS}); ${active.size} active`);

  // Line-buffered newline-delimited JSON: events can span chunk boundaries, so
  // hold a partial-line buffer and only dispatch complete lines.
  let buf = "";
  let stderr = "";
  let resultSeen = false;

  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }
    let ev;
    try {
      ev = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (ev.type === "result") {
      resultSeen = true;
      settleFromResult(n, ev);
      return;
    }
    narrateEvent(n, ev);
  };

  child.stdout.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      handleLine(line);
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  child.on("exit", (code) => {
    // Flush any trailing partial line (a final event without a newline).
    if (buf.trim()) {
      handleLine(buf);
      buf = "";
    }
    active.delete(n);
    // A stream that ended without a terminal result event is a crash/kill,
    // regardless of exit code -> quarantine.
    if (!resultSeen) {
      quarantined.add(n);
      workerLog(n, `✗ died without completing (exit ${code}, no result event); QUARANTINED (no relaunch this session)`);
      const tail = stderr.trim().slice(-2000);
      if (tail) {
        log(`  #${n} stderr tail: ${tail}`);
      }
    }
    releaseColor(n);
  });

  child.on("error", (err) => {
    active.delete(n);
    quarantined.add(n);
    log(`worker for #${n} failed to start: ${err.message}; QUARANTINED (no relaunch this session)`);
    releaseColor(n);
  });
}

/**
 * Read the queue off the bot/plan-doc branch and return the eligible issue
 * numbers, applying the label filter. On ANY error (branch missing, file
 * missing, git error, parse error) return an empty set -- an empty/missing queue
 * is the normal idle state, and the drainer must never crash or exit over it.
 */
async function readQueue() {
  try {
    await execFileAsync("git", ["fetch", "origin", "bot/plan-doc", "-q"], { cwd: REPO_ROOT });
    const { stdout } = await execFileAsync(
      "git",
      ["show", "origin/bot/plan-doc:ready.json"],
      { cwd: REPO_ROOT, maxBuffer: 16 * 1024 * 1024 },
    );
    const parsed = JSON.parse(stdout);
    const eligible = parsed.filter((entry) => {
      if (LABEL_FILTER.size === 0) {
        return true;
      }
      const labels = Array.isArray(entry.labels) ? entry.labels : [];
      return labels.some((label) => LABEL_FILTER.has(label));
    });
    return new Set(eligible.map((entry) => entry.number));
  } catch {
    return new Set();
  }
}

async function cycle() {
  const queue = await readQueue();

  // Prune `handled`: once an issue's line has cleared from the queue, drop it so
  // a legitimate future re-appearance becomes eligible again. Deliberately NO
  // time-based TTL -- a slow merge queue must not cause a relaunch, because
  // relaunching a successfully-worked issue would open a DUPLICATE PR. Holding
  // handled-until-the-line-clears is the safe choice; a genuinely stuck issue
  // staying un-relaunched (for a human to notice) is the correct, safer failure
  // mode.
  for (const n of handled) {
    if (!queue.has(n)) {
      handled.delete(n);
    }
  }

  for (const n of queue) {
    if (active.has(n) || handled.has(n) || quarantined.has(n)) {
      continue;
    }
    spawnWorker(n);
  }
}

process.on("SIGINT", () => {
  const inflight = [...active.keys()];
  if (inflight.length) {
    log(`SIGINT: terminating ${inflight.length} in-flight worker(s): ${inflight.map((n) => `#${n}`).join(", ")}`);
  } else {
    log("SIGINT: no active workers; exiting cleanly");
  }
  process.exit(0);
});

const filterBanner = LABEL_FILTER.size > 0 ? [...LABEL_FILTER].join(",") : "none";
log(
  `plan-queue-drainer watching origin/bot/plan-doc:ready.json every ${POLL_MS / 1000}s, `
    + `unbounded fan-out, ${MAX_TURNS} turns/worker | label filter: ${filterBanner}. `
    + `Ctrl-C to stop (terminates in-flight workers -- clean stop is Ctrl-C when nothing is active).`,
);

await cycle();
setInterval(cycle, POLL_MS);
