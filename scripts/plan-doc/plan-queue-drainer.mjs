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
// Dedup model -- two structures:
//
//   - `active`: Map<number, ChildProcess>. Issues with a currently-running
//     worker. Populated on spawn, pruned in the child's `exit` handler. Because
//     it holds real process handles, "is #N being worked?" is a fact, not a
//     guess.
//   - `handled`: Set<number>. Issues whose worker exited SUCCESSFULLY (code 0)
//     but which are still present in ready.json because the removal hasn't
//     propagated yet (merge -> issue event -> plan-doc rebuild -> branch push
//     has lag). Prevents relaunching a just-completed issue during that lag.
//
//   Spawn iff `!active.has(n) && !handled.has(n)`, subject to MAX_CONCURRENT.
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
// Each worker is a full opus session; the cap guards against runaway token
// spend when the queue is large. Overridable via DRAIN_MAX.
const MAX_CONCURRENT = Number(process.env.DRAIN_MAX) || 4;

/** issue number -> its running worker process. Pruned on child exit. */
const active = new Map();
/** issue numbers whose worker succeeded; held until the queue line clears. */
const handled = new Set();

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/**
 * Read the queue off the bot/plan-doc branch and return the set of issue
 * numbers. On ANY error (branch missing, file missing, git error, parse error)
 * return an empty set -- an empty/missing queue is the normal idle state, and
 * the drainer must never crash or exit over it.
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
    return new Set(parsed.map((entry) => entry.number));
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
    ],
    { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );

  active.set(n, child);
  log(`spawn worker for #${n} (pid ${child.pid}); ${active.size} active`);

  // Capture worker output so a crash surfaces in the drainer's log rather than
  // vanishing. The exit code is what drives active/handled; stdout is logged
  // only on a non-zero exit for diagnosis.
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
    if (code === 0) {
      // Success: hold the issue in `handled` until its line clears from the
      // queue, so the propagation lag doesn't relaunch a completed worker.
      handled.add(n);
      log(`worker for #${n} done (exit 0); awaiting removal from queue`);
    } else {
      // Crash/error: do NOT add to handled -- it stays eligible and retries
      // next cycle.
      log(`worker for #${n} FAILED (exit ${code}); will retry next cycle`);
      const tail = (stderr || stdout).trim().slice(-2000);
      if (tail) {
        log(`  #${n} output tail: ${tail}`);
      }
    }
  });

  child.on("error", (err) => {
    active.delete(n);
    log(`worker for #${n} failed to start: ${err.message}; will retry next cycle`);
  });
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
    if (active.has(n) || handled.has(n)) {
      continue;
    }
    if (active.size >= MAX_CONCURRENT) {
      log(`concurrency cap ${MAX_CONCURRENT} reached; deferring #${n} to a later cycle`);
      break;
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

log(
  `plan-queue-drainer watching origin/bot/plan-doc:ready.json every ${POLL_MS / 1000}s, `
    + `max ${MAX_CONCURRENT} concurrent workers. Ctrl-C to stop `
    + `(terminates in-flight workers -- clean stop is Ctrl-C when nothing is active).`,
);

await cycle();
setInterval(cycle, POLL_MS);
