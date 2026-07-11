// IDistributedCache -- ported from ME.Caching.Abstractions' IDistributedCache.
//
// Platform adaptations from the reference:
//   - `byte[]` payloads map to `Uint8Array`; a miss returns `undefined` (the
//     repo idiom), not null.
//   - The reference's sync+async member pairs (Get/GetAsync, Set/SetAsync,
//     Refresh/RefreshAsync, Remove/RemoveAsync) collapse into single
//     Promise-returning members -- a distributed cache is remote IO, and this
//     runtime has no synchronous IO analog.
//   - The reference `CancellationToken token = default` parameters map to an
//     optional {@link AbortSignal} (docs §39).

import type { AbortSignal } from '@rhombus-std/primitives';
import type { DistributedCacheEntryOptions } from './DistributedCacheEntryOptions';

/** Represents a distributed cache of serialized values. */
export interface IDistributedCache {
  /**
   * Gets a value with the given key.
   *
   * @returns The located value, or `undefined` if not present.
   */
  get(key: string, abortSignal?: AbortSignal): Promise<Uint8Array | undefined>;

  /** Sets a value with the given key. */
  set(
    key: string,
    value: Uint8Array,
    options: DistributedCacheEntryOptions,
    abortSignal?: AbortSignal,
  ): Promise<void>;

  /**
   * Refreshes a value in the cache based on its key, resetting its sliding
   * expiration timeout (if any).
   */
  refresh(key: string, abortSignal?: AbortSignal): Promise<void>;

  /** Removes the value with the given key. */
  remove(key: string, abortSignal?: AbortSignal): Promise<void>;
}
