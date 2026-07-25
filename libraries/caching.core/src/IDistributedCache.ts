import type { AbortSignal } from '@rhombus-std/primitives';
import type { DistributedCacheEntryOptions } from './DistributedCacheEntryOptions';

/** Represents a distributed cache of serialized values. */
export interface IDistributedCache {
  /** Gets the value for `key`, or `undefined` if not present. */
  get(key: string, abortSignal?: AbortSignal): Promise<Uint8Array | undefined>;

  /** Sets a value with the given key. */
  set(key: string, value: Uint8Array, options: DistributedCacheEntryOptions, abortSignal?: AbortSignal): Promise<void>;

  /**
   * Refreshes a value in the cache based on its key, resetting its sliding
   * expiration timeout (if any).
   */
  refresh(key: string, abortSignal?: AbortSignal): Promise<void>;

  /** Removes the value with the given key. */
  remove(key: string, abortSignal?: AbortSignal): Promise<void>;
}
