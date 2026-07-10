// ICacheEntry -- ported from ME.Caching.Abstractions' ICacheEntry.
//
// Type mapping from the reference runtime: `object Key` / `object? Value` ->
// `unknown`; `DateTimeOffset?` -> `Date | undefined`; `TimeSpan?` -> `number |
// undefined` (a duration in MILLISECONDS, the JS convention); the reference
// `IDisposable` -> the built-in `Disposable` (`Symbol.dispose`). Disposing the
// entry COMMITS it to the cache (see @rhombus-std/caching.memory's CacheEntry).

import type { IChangeToken } from "@rhombus-std/primitives";
import type { CacheItemPriority } from "./CacheItemPriority";
import type { PostEvictionCallbackRegistration } from "./PostEvictionCallbackRegistration";

/**
 * Represents an entry in an {@link IMemoryCache}. When disposed, the entry is
 * committed to the cache.
 */
export interface ICacheEntry extends Disposable {
  /** The key of the cache entry. */
  readonly key: unknown;

  /** The value of the cache entry. */
  value: unknown;

  /** An absolute expiration date for the entry, or `undefined` for none. */
  absoluteExpiration: Date | undefined;

  /** An absolute expiration time in milliseconds relative to now, or `undefined`. */
  absoluteExpirationRelativeToNow: number | undefined;

  /**
   * How long (in milliseconds) the entry may be inactive (not accessed)
   * before it is removed. Does not extend the entry's lifetime beyond
   * {@link absoluteExpiration}.
   */
  slidingExpiration: number | undefined;

  /** The {@link IChangeToken} instances that cause the entry to expire. */
  readonly expirationTokens: IChangeToken[];

  /** The callbacks fired after the entry is evicted. */
  readonly postEvictionCallbacks: PostEvictionCallbackRegistration[];

  /** The priority for keeping the entry during a compaction. Defaults to `Normal`. */
  priority: CacheItemPriority;

  /** The size of the entry value, or `undefined` when unsized. */
  size: number | undefined;
}
