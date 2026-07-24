import type { ICacheEntry } from './ICacheEntry';
import type { MemoryCacheStatistics } from './MemoryCacheStatistics';

/**
 * The result of {@link IMemoryCache.tryGetValue}: `[false]` on a miss,
 * `[true, value]` on a hit (where `value` may itself be `undefined`).
 */
export type CacheTryGetResult = [found: false] | [found: true, value: unknown];

/** A local in-memory cache whose values are not serialized. */
export interface IMemoryCache extends Disposable {
  /** Gets the item associated with `key` if present. */
  tryGetValue(key: unknown): CacheTryGetResult;

  /**
   * Creates or overwrites an entry in the cache. The returned
   * {@link ICacheEntry} is committed when disposed.
   */
  createEntry(key: unknown): ICacheEntry;

  /** Removes the entry associated with `key`. */
  remove(key: unknown): void;

  /**
   * Gets a snapshot of the cache statistics, or `undefined` if the
   * implementation does not track statistics (for `MemoryCache`, when
   * `MemoryCacheOptions.trackStatistics` is off).
   */
  getCurrentStatistics(): MemoryCacheStatistics | undefined;
}
