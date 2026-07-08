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
//   - `handled`: Set<number>. Issues whose worker exited with a `success`
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
// Outcome handling: worker processes exit 0 even when they hit a limit, so the
// exit code is NOT authoritative. We parse the `--output-format json` result and
// branch on its `subtype`: `success` -> handled; `error_max_turns` /
// `error_during_execution` / any other `error_*` -> quarantine. A non-zero exit,
// empty output, or unparseable JSON is treated as a crash -> quarantine, with the
// raw output logged for diagnosis.
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
// the result carries `subtype: "error_max_turns"`, which quarantines the issue.
// Overridable via DRAIN_MAX_TURNS.
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

/** issue number -> its running worker process. Pruned on child exit. */
const active = new Map();
/** issue numbers whose worker succeeded; held until the queue line clears. */
const handled = new Set();
/** issue numbers whose worker errored; never relaunched this session. */
const quarantined = new Set();

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
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

/** Spawn a worker for issue #n, wiring the child's exit into active/handled. */
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
      "json",
      "--max-turns",
      String(MAX_TURNS),
    ],
    { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );

  active.set(n, child);
  log(`spawn worker for #${n} (pid ${child.pid}, max-turns ${MAX_TURNS}); ${active.size} active`);

  // Capture worker output. The JSON result on stdout drives the outcome; stderr
  // is kept for crash diagnosis.
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  child.on("exit", (code) => {
    active.delete(n);
    settleWorker(n, code, stdout, stderr);
  });

  child.on("error", (err) => {
    active.delete(n);
    quarantined.add(n);
    log(`worker for #${n} failed to start: ${err.message}; QUARANTINED (no relaunch this session)`);
  });
}

/**
 * Decide a finished worker's outcome from its JSON result, not its exit code
 * (runs that hit a limit still exit 0). `success` -> handled; any error subtype
 * or a crash (non-zero exit / empty / unparseable output) -> quarantine.
 */
function settleWorker(n, code, stdout, stderr) {
  let result = null;
  try {
    const trimmed = stdout.trim();
    if (trimmed) {
      result = JSON.parse(trimmed);
    }
  } catch {
    result = null;
  }

  const cost = result && typeof result.total_cost_usd === "number"
    ? `$${result.total_cost_usd.toFixed(4)}`
    : "n/a";

  // Crash: non-zero exit, or output we couldn't parse into a result object.
  if (code !== 0 || result === null || typeof result !== "object") {
    quarantined.add(n);
    log(
      `worker for #${n} CRASHED (exit ${code}, unparseable/empty result; cost ${cost}); QUARANTINED (no relaunch this session)`,
    );
    const tail = (stderr || stdout).trim().slice(-2000);
    if (tail) {
      log(`  #${n} output tail: ${tail}`);
    }
    return;
  }

  const subtype = typeof result.subtype === "string" ? result.subtype : "(missing subtype)";

  if (subtype === "success") {
    // Success: hold the issue in `handled` until its line clears from the queue,
    // so the propagation lag doesn't relaunch a completed worker.
    handled.add(n);
    log(`worker for #${n} done (success; cost ${cost}); awaiting removal from queue`);
    return;
  }

  // Any recognized error_* subtype, or an unrecognized shape: quarantine. Log
  // the raw result on an unexpected subtype so a new CLI shape is diagnosable.
  quarantined.add(n);
  log(`worker for #${n} ERRORED (subtype ${subtype}; cost ${cost}); QUARANTINED (no relaunch this session)`);
  if (!subtype.startsWith("error")) {
    log(`  #${n} unrecognized result shape: ${JSON.stringify(result).slice(-2000)}`);
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
