// IMemoryCache -- ported from ME.Caching.Abstractions' IMemoryCache.
//
// The reference `bool TryGetValue(object key, out object? value)` maps to a
// result TUPLE, mirroring @rhombus-std/config.core's `ITryGetResult` idiom
// (an out-bool + out-value collapse into a discriminated tuple TS narrows on
// element 0). `GetCurrentStatistics()` and the span-key overloads are not
// ported (see the README): they are perf/diagnostic surface with no
// no-transformer consumer yet.

import type { ICacheEntry } from "./ICacheEntry";

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
}
