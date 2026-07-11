// IMemoryCache -- ported from ME.Caching.Abstractions' IMemoryCache.
//
// The reference `bool TryGetValue(object key, out object? value)` maps to a
// result TUPLE, mirroring @rhombus-std/config.core's `ITryGetResult` idiom
// (an out-bool + out-value collapse into a discriminated tuple TS narrows on
// element 0). The reference `GetCurrentStatistics` is a default interface
// method returning null (so pre-existing implementations don't break); TS
// interfaces carry no default bodies, so it is a REQUIRED member here -- an
// implementation that doesn't track statistics returns `undefined`, which is
// exactly what the reference default does. The span-key `TryGetValue`
// overloads are NOT ported: they exist purely so a string key can be queried
// from a char span without allocating a new string, a distinction that has no
// meaning in JS (there is no non-string char-span representation to avoid
// allocating from).

import type { ICacheEntry } from "./ICacheEntry";
import type { MemoryCacheStatistics } from "./MemoryCacheStatistics";

/**
 * The result of {@link IMemoryCache.tryGetValue}: `[false]` on a miss,
 * `[true, value]` on a hit (where `value` may itself be `undefined`).
 */
export type CacheTryGetResult = [found: false] | [found: true, value: unknown];

/** A local in-memory cache whose values are not serialized. */
export interface IMemoryCache extends Disposable {
  /**
   * Gets the item associated with `key` if present.
   *
   * @returns `[true, value]` if found, `[false]` otherwise.
   */
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
