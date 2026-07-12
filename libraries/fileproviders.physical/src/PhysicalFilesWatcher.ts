// PhysicalFilesWatcher -- ported (as a faithful subset) from
// ME.FileProviders.Physical.PhysicalFilesWatcher.
//
// Hands out an IChangeToken for a watched target and fires it when the target
// changes. Two modes, selected per provider (mirroring the reference's
// FileSystemWatcher-vs-polling split):
//
//   - ACTIVE (default): one `fs.watch` per target backs an AbortSignal-driven
//     CancellationChangeToken. On a matching event the token is cancelled,
//     removed from the lookup, and its watcher closed -- so the next `watch`
//     of the same target hands back a fresh token (the reference removes a
//     fired token from its lookup for the same reason). DEVIATION (flagged):
//     Node/Bun recursive `fs.watch` is unreliable on Linux (the repo's target
//     platform), so active recursive directory watching is best-effort; the
//     deterministic path for directories is polling.
//
//   - POLLING: a PollingFileChangeToken per target. Passive by default (the
//     consumer polls `hasChanged`); when active-polling is enabled, a single
//     shared timer periodically fires any token whose `hasChanged` has flipped.
//
// DEVIATIONS from the reference watcher (flagged): this subset does NOT
// composite a cancellation token WITH a polling token (the reference always
// does, using polling as an FSW backstop) -- it picks one mechanism per
// provider, which is behaviorally equivalent for the supported exact-file and
// directory-prefix targets and materially simpler. It also omits the
// not-yet-existent-root (PendingCreationWatcher), renamed-descendant recursion,
// and subdirectory-descriptor-count optimizations (follow-up); polling covers
// correctness meanwhile.

import { type FSWatcher, watch } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { NullChangeToken } from '@rhombus-std/fileproviders.core';
import { AbortController, CancellationChangeToken, clearTimeout, type IChangeToken, setTimeout,
  type TimeoutHandle } from '@rhombus-std/primitives';

import type { ExclusionFilters } from './ExclusionFilters.js';
import { isDirectoryPath, pathNavigatesAboveRoot } from './PathUtils.js';
import { DEFAULT_POLLING_INTERVAL_MS, PollingFileChangeToken } from './PollingFileChangeToken.js';

interface ActiveTokenInfo {
  readonly abort: () => void;
  readonly token: IChangeToken;
}

/**
 * Watches a physical directory tree and hands out change tokens for exact-file
 * and directory-prefix targets.
 */
export class PhysicalFilesWatcher {
  /**
   * The interval, in milliseconds, at which the shared active-polling timer
   * fires. Mutable so white-box tests can drive a deterministic short cadence.
   */
  public static pollingIntervalMs = DEFAULT_POLLING_INTERVAL_MS;

  readonly #root: string;
  readonly #pollForChanges: boolean;
  readonly #useActivePolling: boolean;
  readonly #filters: ExclusionFilters;
  readonly #activeTokens = new Map<string, ActiveTokenInfo>();
  readonly #fsWatchers = new Map<string, FSWatcher>();
  readonly #pollingTokens = new Set<PollingFileChangeToken>();
  #timer: TimeoutHandle | undefined;
  #disposed = false;

  /**
   * Initializes a new instance of the {@link PhysicalFilesWatcher} class.
   *
   * @param root The absolute root directory, with a trailing separator.
   * @param pollForChanges `true` to hand out polling tokens instead of
   * `fs.watch`-backed tokens.
   * @param useActivePolling `true` to drive polling tokens' callbacks from a
   * shared timer (only meaningful when `pollForChanges` is `true`).
   * @param filters The exclusion filters applied when polling a directory
   * subtree.
   */
  public constructor(
    root: string,
    pollForChanges: boolean,
    useActivePolling: boolean,
    filters: ExclusionFilters,
  ) {
    this.#root = root;
    this.#pollForChanges = pollForChanges;
    this.#useActivePolling = useActivePolling;
    this.#filters = filters;
  }

  /**
   * Creates a change token for the given filter (an exact file path or a
   * directory path ending in a separator, relative to the root).
   *
   * @param filter The relative file or directory path to watch.
   * @returns A change token, or {@link NullChangeToken.singleton} if the filter
   * is absolute or navigates above the root.
   */
  public createFileChangeToken(filter: string): IChangeToken {
    if (this.#disposed) {
      return NullChangeToken.singleton;
    }

    const normalized = filter.replace(/\\/g, '/');
    if (isAbsolute(normalized) || pathNavigatesAboveRoot(normalized)) {
      return NullChangeToken.singleton;
    }

    const pattern = normalized.startsWith('./') ? normalized.slice(2) : normalized;

    if (this.#pollForChanges) {
      return this.#createPollingToken(pattern);
    }
    return this.#createActiveToken(pattern);
  }

  #createActiveToken(pattern: string): IChangeToken {
    const existing = this.#activeTokens.get(pattern);
    if (existing !== undefined) {
      return existing.token;
    }

    const controller = new AbortController();
    const token = new CancellationChangeToken(controller.signal);
    this.#activeTokens.set(pattern, { abort: () => controller.abort(), token });
    this.#enableWatch(pattern);
    return token;
  }

  #enableWatch(pattern: string): void {
    const fullTarget = resolve(join(this.#root, pattern));
    try {
      if (isDirectoryPath(pattern)) {
        // Best-effort recursive directory watch (unreliable on Linux).
        const watcher = watch(fullTarget, { recursive: true }, () => this.#onChange(pattern));
        this.#fsWatchers.set(pattern, watcher);
      } else {
        // Watch the parent directory and match the file name -- more reliable
        // than watching a file node directly.
        const base = basename(fullTarget);
        const watcher = watch(dirname(fullTarget), { recursive: false }, (_event, filename) => {
          if (filename === null || filename === base) {
            this.#onChange(pattern);
          }
        });
        this.#fsWatchers.set(pattern, watcher);
      }
    } catch {
      // The target directory may not exist yet; leave the token passive. It
      // never fires -- a limitation covered by the polling mode and the
      // deferred pending-creation watcher.
    }
  }

  #onChange(pattern: string): void {
    const info = this.#activeTokens.get(pattern);
    if (info === undefined) {
      return;
    }
    this.#activeTokens.delete(pattern);
    const watcher = this.#fsWatchers.get(pattern);
    if (watcher !== undefined) {
      watcher.close();
      this.#fsWatchers.delete(pattern);
    }
    info.abort();
  }

  #createPollingToken(pattern: string): IChangeToken {
    const fullTarget = resolve(join(this.#root, pattern));
    const token = new PollingFileChangeToken(fullTarget, isDirectoryPath(pattern), this.#filters);

    if (this.#useActivePolling) {
      token.activate();
      this.#pollingTokens.add(token);
      this.#ensureTimer();
    }

    return token;
  }

  #ensureTimer(): void {
    if (this.#timer !== undefined) {
      return;
    }
    const tick = (): void => {
      this.#raiseChangeEvents();
      if (!this.#disposed && this.#pollingTokens.size > 0) {
        this.#timer = setTimeout(tick, PhysicalFilesWatcher.pollingIntervalMs);
      } else {
        this.#timer = undefined;
      }
    };
    this.#timer = setTimeout(tick, PhysicalFilesWatcher.pollingIntervalMs);
  }

  #raiseChangeEvents(): void {
    for (const token of this.#pollingTokens) {
      if (token.hasChanged) {
        this.#pollingTokens.delete(token);
        token.fireCallbacks();
      }
    }
  }

  /**
   * Disposes the watcher: closes every `fs.watch`, stops the polling timer, and
   * cancels every outstanding active token. Idempotent.
   */
  public [Symbol.dispose](): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;

    for (const watcher of this.#fsWatchers.values()) {
      watcher.close();
    }
    this.#fsWatchers.clear();

    for (const info of this.#activeTokens.values()) {
      info.abort();
    }
    this.#activeTokens.clear();

    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
    this.#pollingTokens.clear();
  }
}
