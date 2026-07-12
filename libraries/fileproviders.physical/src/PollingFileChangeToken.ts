// PollingFileChangeToken -- ported from
// ME.FileProviders.Physical.PollingFileChangeToken.
//
// A change token that detects file-system changes by polling, rather than by
// an OS file watcher. `hasChanged` re-reads the target's modification time (or,
// for a directory-prefix target, a structural signature of its subtree) at
// most once per polling interval, and latches `true` permanently once a change
// is observed -- so the token must be discarded and re-created after it fires
// (as the IChangeToken contract requires).
//
// The reference collapses the file case (PollingFileChangeToken, using the
// file's LastWriteTimeUtc) and the directory/wildcard case
// (PollingWildCardChangeToken, hashing the sorted (path, mtime) pairs of the
// subtree) into two types. This port unifies them behind one `#getSignature`:
//   - file target -> the mtime in milliseconds, as a string;
//   - directory target -> the sorted `path:mtimeMs` pairs of the subtree,
//     joined (DEVIATION, flagged: the reference uses a SHA over the sorted
//     pairs; a structural join is equivalent for change detection and cheaper).
//
// By default the token is passive (`activeChangeCallbacks` false) and the
// consumer must poll `hasChanged`. When `activate()` is called (active-polling
// mode), an AbortSignal-backed inner token drives registered callbacks, which
// the watcher's timer fires once `hasChanged` flips.

import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { AbortController, CancellationChangeToken, type IChangeToken } from '@rhombus-std/primitives';

import type { ExclusionFilters } from './ExclusionFilters.js';
import { isExcluded } from './FileSystemInfoHelper.js';

/**
 * The default polling interval, matching the reference's 4-second cadence.
 */
export const DEFAULT_POLLING_INTERVAL_MS = 4000;

const NO_OP_DISPOSABLE: Disposable = { [Symbol.dispose]() {} };

/**
 * An {@link IChangeToken} that polls a file or directory-prefix target for
 * changes.
 */
export class PollingFileChangeToken implements IChangeToken {
  /**
   * The polling interval in milliseconds. Mutable so white-box tests can drive
   * a deterministic short interval (mirrors the reference's internal
   * `PollingInterval`).
   */
  public static pollingIntervalMs = DEFAULT_POLLING_INTERVAL_MS;

  readonly #fullPath: string;
  readonly #isDirectory: boolean;
  readonly #filters: ExclusionFilters;
  #previousSignature: string;
  #lastCheckedMs = 0;
  #hasChanged = false;
  #activeChangeCallbacks = false;
  #innerToken: CancellationChangeToken | undefined;
  #abort: (() => void) | undefined;

  /**
   * Initializes a new instance of the {@link PollingFileChangeToken} class.
   *
   * @param fullPath The absolute path of the file or directory to poll.
   * @param isDirectory `true` to poll the subtree rooted at `fullPath`;
   * `false` to poll the single file.
   * @param filters The exclusion filters applied when walking a directory
   * subtree.
   */
  public constructor(fullPath: string, isDirectory: boolean, filters: ExclusionFilters) {
    this.#fullPath = fullPath;
    this.#isDirectory = isDirectory;
    this.#filters = filters;
    this.#previousSignature = this.#getSignature();
  }

  /**
   * A value that indicates whether this token proactively raises callbacks.
   */
  public get activeChangeCallbacks(): boolean {
    return this.#activeChangeCallbacks;
  }

  /**
   * Switches the token into active-polling mode: registered callbacks fire
   * (via {@link fireCallbacks}) once a change is observed. Called by the
   * watcher when active polling is enabled.
   */
  public activate(): void {
    this.#activeChangeCallbacks = true;
    const controller = new AbortController();
    this.#abort = () => controller.abort();
    this.#innerToken = new CancellationChangeToken(controller.signal);
  }

  /**
   * Signals every registered callback. Called by the watcher's polling timer
   * once {@link hasChanged} has flipped for this token.
   */
  public fireCallbacks(): void {
    this.#abort?.();
  }

  #getSignature(): string {
    if (this.#isDirectory) {
      return this.#getDirectorySignature();
    }
    const stats = statSync(this.#fullPath, { throwIfNoEntry: false });
    return stats !== undefined ? String(stats.mtimeMs) : '';
  }

  #getDirectorySignature(): string {
    const parts: string[] = [];
    const walk = (dir: string): void => {
      let dirents;
      try {
        dirents = readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const dirent of dirents) {
        if (isExcluded(dirent.name, this.#filters)) {
          continue;
        }
        const child = join(dir, dirent.name);
        const stats = statSync(child, { throwIfNoEntry: false });
        if (stats === undefined) {
          continue;
        }
        parts.push(`${child}:${stats.mtimeMs}`);
        if (dirent.isDirectory()) {
          walk(child);
        }
      }
    };
    walk(this.#fullPath);
    parts.sort();
    return parts.join('|');
  }

  /**
   * A value that indicates whether the target has changed since the token was
   * created. Re-checks at most once per {@link pollingIntervalMs}, and latches
   * `true` once a change is observed.
   */
  public get hasChanged(): boolean {
    if (this.#hasChanged) {
      return true;
    }
    const now = Date.now();
    if (now - this.#lastCheckedMs < PollingFileChangeToken.pollingIntervalMs) {
      return this.#hasChanged;
    }
    const signature = this.#getSignature();
    if (this.#previousSignature !== signature) {
      this.#previousSignature = signature;
      this.#hasChanged = true;
    }
    this.#lastCheckedMs = now;
    return this.#hasChanged;
  }

  /**
   * Registers a callback invoked when the token changes, if active-polling was
   * enabled via {@link activate}. Otherwise no callback is registered and an
   * inert disposable is returned.
   *
   * @param callback The callback to invoke.
   * @param state State passed to the callback.
   */
  public registerChangeCallback(callback: (state: unknown) => void, state?: unknown): Disposable {
    if (!this.#activeChangeCallbacks || this.#innerToken === undefined) {
      return NO_OP_DISPOSABLE;
    }
    return this.#innerToken.registerChangeCallback(callback, state);
  }
}
