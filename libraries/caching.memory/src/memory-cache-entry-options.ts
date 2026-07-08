// MemoryCacheEntryOptions -- ported from MemoryCacheEntryOptions.
//
// Upstream this type lives in Caching.Abstractions; this port places it in
// caching.memory per the family layout for this pass (see the README note on
// the split). It carries the same per-entry knobs an ICacheEntry exposes, so
// a caller can build one options bag and apply it to many entries via
// `setEntryOptions`. Durations are milliseconds; the absolute expiration is a
// `Date`.

import type { CacheItemPriority, PostEvictionCallbackRegistration } from "@rhombus-std/caching.core";
import { CacheItemPriority as Priority } from "@rhombus-std/caching.core";
import type { IChangeToken } from "@rhombus-std/primitives";

/** A reusable bag of the cache options applied to an entry via `setEntryOptions`. */
export class MemoryCacheEntryOptions {
  #absoluteExpirationRelativeToNow: number | undefined = undefined;
  #slidingExpiration: number | undefined = undefined;
  #size: number | undefined = undefined;
  #expirationTokens: IChangeToken[] | undefined = undefined;
  #postEvictionCallbacks: PostEvictionCallbackRegistration[] | undefined = undefined;

  /** An absolute expiration date for the entry. */
  public absoluteExpiration: Date | undefined = undefined;

  /** The priority for keeping the entry during a compaction. Defaults to `Normal`. */
  public priority: CacheItemPriority = Priority.Normal;

  /** An absolute expiration in milliseconds relative to now. Throws if not positive. */
  public get absoluteExpirationRelativeToNow(): number | undefined {
    return this.#absoluteExpirationRelativeToNow;
  }

  public set absoluteExpirationRelativeToNow(value: number | undefined) {
    if (value !== undefined && value <= 0) {
      throw new RangeError(`absoluteExpirationRelativeToNow must be positive, was ${value}.`);
    }
    this.#absoluteExpirationRelativeToNow = value;
  }

  /** Inactivity window (milliseconds) before removal. Throws if not positive. */
  public get slidingExpiration(): number | undefined {
    return this.#slidingExpiration;
  }

  public set slidingExpiration(value: number | undefined) {
    if (value !== undefined && value <= 0) {
      throw new RangeError(`slidingExpiration must be positive, was ${value}.`);
    }
    this.#slidingExpiration = value;
  }

  /** The size of the entry value. Throws if negative. */
  public get size(): number | undefined {
    return this.#size;
  }

  public set size(value: number | undefined) {
    if (value !== undefined && value < 0) {
      throw new RangeError(`size must be non-negative, was ${value}.`);
    }
    this.#size = value;
  }

  /** The change tokens that expire the entry (lazily created). */
  public get expirationTokens(): IChangeToken[] {
    return (this.#expirationTokens ??= []);
  }

  /** The direct backing list, `undefined` when never touched (avoids allocating on apply). */
  public get expirationTokensDirect(): readonly IChangeToken[] | undefined {
    return this.#expirationTokens;
  }

  /** The callbacks fired after eviction (lazily created). */
  public get postEvictionCallbacks(): PostEvictionCallbackRegistration[] {
    return (this.#postEvictionCallbacks ??= []);
  }

  /** The direct backing list, `undefined` when never touched. */
  public get postEvictionCallbacksDirect(): readonly PostEvictionCallbackRegistration[] | undefined {
    return this.#postEvictionCallbacks;
  }
}
