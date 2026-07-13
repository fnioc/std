// Behavior tests for PhysicalFileProvider.watch.
//
// The POLLING tests are the authoritative determinism gate: polling change
// detection is driven entirely by comparing modification times, so they are
// made deterministic WITHOUT sleeps by exploiting that a freshly-created
// PollingFileChangeToken always evaluates its target on the FIRST `hasChanged`
// read (its last-checked time starts at the epoch, so the polling interval is
// already elapsed). Bumping the target's mtime via `utimesSync` before that
// first read guarantees a distinct signature.
//
// The ACTIVE (fs.watch) test is best-effort: OS file-event delivery is not
// deterministic on Linux (the repo's target platform), so it asserts the
// reliable token contract hard and treats an actual event as a bonus -- the
// polling tests above are what guarantee change-detection correctness.

import { NullChangeToken } from '@rhombus-std/fileproviders.core';
import { PhysicalFileProvider } from '@rhombus-std/fileproviders.physical';
import { ExclusionFilters } from '@rhombus-std/fileproviders.physical/_/ExclusionFilters';
import { PhysicalFilesWatcher } from '@rhombus-std/fileproviders.physical/_/PhysicalFilesWatcher';
import { PollingFileChangeToken } from '@rhombus-std/fileproviders.physical/_/PollingFileChangeToken';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root: string;
const originalWatcherInterval = PhysicalFilesWatcher.pollingIntervalMs;
const originalTokenInterval = PollingFileChangeToken.pollingIntervalMs;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fp-physical-watch-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  // Both statics gate active polling and must be restored together (they are
  // independent knobs -- see the active-polling test below).
  PhysicalFilesWatcher.pollingIntervalMs = originalWatcherInterval;
  PollingFileChangeToken.pollingIntervalMs = originalTokenInterval;
});

// Push a path's mtime a fixed amount into the future so a signature comparison
// sees a definite change regardless of clock granularity.
function bumpMtime(path: string): void {
  const future = new Date(Date.now() + 10_000);
  utimesSync(path, future, future);
}

function pollingProvider(): PhysicalFileProvider {
  const provider = new PhysicalFileProvider(root);
  // Passive polling: no shared timer, deterministic via the first-read rule.
  provider.usePollingFileWatcher = true;
  provider.useActivePolling = false;
  return provider;
}

describe('PhysicalFileProvider.watch guards', () => {
  test('throws for a wildcard filter (glob watching is deferred)', () => {
    const provider = new PhysicalFileProvider(root);
    expect(() => provider.watch('**/*.txt')).toThrow('Wildcard');
  });

  test('returns the NullChangeToken singleton for an above-root filter', () => {
    const provider = pollingProvider();
    expect(provider.watch('../escape.txt')).toBe(NullChangeToken.singleton);
  });
});

describe('PhysicalFileProvider.watch polling (exact file)', () => {
  test('does not report a change when the file is untouched', () => {
    writeFileSync(join(root, 'a.txt'), 'v1');
    const provider = pollingProvider();

    const token = provider.watch('a.txt');
    expect(token.activeChangeCallbacks).toBe(false);
    expect(token.hasChanged).toBe(false);
  });

  test('reports a change after the file is modified', () => {
    writeFileSync(join(root, 'a.txt'), 'v1');
    const provider = pollingProvider();

    const token = provider.watch('a.txt');
    bumpMtime(join(root, 'a.txt'));
    expect(token.hasChanged).toBe(true);
  });

  test('latches: hasChanged stays true once observed', () => {
    writeFileSync(join(root, 'a.txt'), 'v1');
    const provider = pollingProvider();

    const token = provider.watch('a.txt');
    bumpMtime(join(root, 'a.txt'));
    expect(token.hasChanged).toBe(true);

    // Reverting the mtime must not clear the latched change.
    const original = statSync(join(root, 'a.txt')).mtime;
    utimesSync(join(root, 'a.txt'), original, original);
    expect(token.hasChanged).toBe(true);
  });
});

describe('PhysicalFileProvider.watch polling (directory prefix)', () => {
  test('reports a change when a file inside the watched directory changes', () => {
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'sub', 'inner.txt'), 'v1');
    const provider = pollingProvider();

    const token = provider.watch('sub/');
    bumpMtime(join(root, 'sub', 'inner.txt'));
    expect(token.hasChanged).toBe(true);
  });

  test('does not report a change when the subtree is untouched', () => {
    mkdirSync(join(root, 'sub'));
    writeFileSync(join(root, 'sub', 'inner.txt'), 'v1');
    const provider = pollingProvider();

    const token = provider.watch('sub/');
    expect(token.hasChanged).toBe(false);
  });
});

describe('PhysicalFileProvider.watch active mode (best-effort)', () => {
  test('hands out an active, not-yet-changed token and disposes cleanly', async () => {
    writeFileSync(join(root, 'a.txt'), 'v1');
    const provider = new PhysicalFileProvider(root);

    const token = provider.watch('a.txt');
    // Deterministic contract: the fs.watch-backed token is active and unchanged.
    expect(token.activeChangeCallbacks).toBe(true);
    expect(token.hasChanged).toBe(false);

    // Best-effort: attempt to observe a real OS event within a bounded wait.
    // A fired callback is asserted when it arrives; a timeout is tolerated
    // because inotify delivery is not guaranteed in every CI sandbox -- the
    // polling tests above are the authoritative determinism gate.
    const fired = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 1500);
      token.registerChangeCallback(() => {
        clearTimeout(timer);
        resolve(true);
      });
      bumpMtime(join(root, 'a.txt'));
      writeFileSync(join(root, 'a.txt'), 'v2');
    });

    if (fired) {
      expect(token.hasChanged).toBe(true);
    }

    // Disposal must be idempotent and must not throw.
    provider[Symbol.dispose]();
    expect(() => provider[Symbol.dispose]()).not.toThrow();
  });

  // White-box against PhysicalFilesWatcher: the `.` export is dist-referenced,
  // so exercising the shared-timer statics (src copies) through the built
  // provider bundle can't reach them -- the watcher is driven directly, the
  // same seam PollingFileChangeToken's own unit tests use.
  test('disposal does NOT fire outstanding active tokens', () => {
    writeFileSync(join(root, 'a.txt'), 'v1');
    // Active (fs.watch) mode: pollForChanges=false, useActivePolling=false.
    const watcher = new PhysicalFilesWatcher(root, false, false, ExclusionFilters.Sensitive);

    const token = watcher.createFileChangeToken('a.txt');
    expect(token.activeChangeCallbacks).toBe(true);

    let fired = false;
    token.registerChangeCallback(() => {
      fired = true;
    });

    // Mirrors the reference's Dispose: the watcher is torn down but live token
    // sources are abandoned, never cancelled -- so no callback runs on teardown.
    watcher[Symbol.dispose]();
    expect(fired).toBe(false);
    expect(token.hasChanged).toBe(false);
  });
});

describe('PhysicalFilesWatcher active polling (shared timer)', () => {
  test('fires a registered callback once the target changes', async () => {
    writeFileSync(join(root, 'a.txt'), 'v1');
    // Both statics must be lowered: one gates the shared timer's cadence, the
    // other the token's re-stat throttle. Lowering only one leaves the token
    // refusing to re-check within the (still 4 s) other interval.
    PhysicalFilesWatcher.pollingIntervalMs = 5;
    PollingFileChangeToken.pollingIntervalMs = 5;

    // Polling + active-polling mode: pollForChanges=true, useActivePolling=true.
    const watcher = new PhysicalFilesWatcher(root, true, true, ExclusionFilters.Sensitive);

    const token = watcher.createFileChangeToken('a.txt');
    expect(token.activeChangeCallbacks).toBe(true);

    const fired = new Promise<boolean>((resolvePromise) => {
      const timer = setTimeout(() => resolvePromise(false), 1000);
      token.registerChangeCallback(() => {
        clearTimeout(timer);
        resolvePromise(true);
      });
      // Bump synchronously, before the first timer tick reads hasChanged.
      bumpMtime(join(root, 'a.txt'));
    });

    expect(await fired).toBe(true);
    watcher[Symbol.dispose]();
  });
});
