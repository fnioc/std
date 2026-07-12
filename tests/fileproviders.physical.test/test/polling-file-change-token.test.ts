// White-box unit tests for PollingFileChangeToken, reached through the
// internal/* subpath. These pin the interval-gating logic in isolation with a
// short interval override (the same seam the reference exposes for its own unit
// tests): a change is not observed again within one interval of the last check,
// and IS observed once the interval has elapsed. No arbitrary sleeps -- the
// "eventually observed" case polls hasChanged against a bounded deadline.

import { ExclusionFilters } from '@rhombus-std/fileproviders.physical';
import { PollingFileChangeToken } from '@rhombus-std/fileproviders.physical/internal/PollingFileChangeToken';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root: string;
const originalInterval = PollingFileChangeToken.pollingIntervalMs;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'fp-polling-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  PollingFileChangeToken.pollingIntervalMs = originalInterval;
});

function bumpMtime(path: string): void {
  const future = new Date(Date.now() + 10_000);
  utimesSync(path, future, future);
}

async function pollUntil(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  return predicate();
}

describe('PollingFileChangeToken interval gating', () => {
  test('the first read always evaluates and reflects an existing change', () => {
    const file = join(root, 'a.txt');
    writeFileSync(file, 'v1');
    const token = new PollingFileChangeToken(file, false, ExclusionFilters.Sensitive);

    bumpMtime(file);
    // The first hasChanged read is never gated by the interval.
    expect(token.hasChanged).toBe(true);
  });

  test('a change within the interval of the last check is not yet observed', () => {
    PollingFileChangeToken.pollingIntervalMs = 10_000;
    const file = join(root, 'a.txt');
    writeFileSync(file, 'v1');
    const token = new PollingFileChangeToken(file, false, ExclusionFilters.Sensitive);

    // First read: evaluates, no change yet, and records the check time.
    expect(token.hasChanged).toBe(false);

    // Modify, then read again immediately -- still within the 10s interval, so
    // the token must NOT re-check and stays false.
    bumpMtime(file);
    expect(token.hasChanged).toBe(false);
  });

  test('a change is observed once the interval elapses', async () => {
    PollingFileChangeToken.pollingIntervalMs = 20;
    const file = join(root, 'a.txt');
    writeFileSync(file, 'v1');
    const token = new PollingFileChangeToken(file, false, ExclusionFilters.Sensitive);

    // Prime the last-checked time, then modify.
    expect(token.hasChanged).toBe(false);
    bumpMtime(file);

    const observed = await pollUntil(() => token.hasChanged, 1000);
    expect(observed).toBe(true);
  });
});
