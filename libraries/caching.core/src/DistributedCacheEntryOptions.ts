// DistributedCacheEntryOptions -- ported from ME.Caching.Abstractions'
// DistributedCacheEntryOptions. Durations are milliseconds; the absolute
// expiration is a `Date` (the same mapping as MemoryCacheEntryOptions).
//
// The reference's internal `Freeze()` (guarding the shared default-options
// singleton in DistributedCacheExtensions against mutation) is ported as the
// module-scoped `freezeDistributedCacheEntryOptions` below -- exported from
// this module for the family's own use and for white-box tests via the
// `internal/*` subpath, but NOT from the package barrel, mirroring the
// reference's `internal` visibility.

/** The frozen instances -- the analog of the reference's private `_frozen` flag. */
const frozenInstances = new WeakSet<DistributedCacheEntryOptions>();

/** Provides the cache options for an entry in an `IDistributedCache`. */
export class DistributedCacheEntryOptions {
  #absoluteExpiration: Date | undefined = undefined;
  #absoluteExpirationRelativeToNow: number | undefined = undefined;
  #slidingExpiration: number | undefined = undefined;

  /** An absolute expiration date for the cache entry. Throws if frozen. */
  public get absoluteExpiration(): Date | undefined {
    return this.#absoluteExpiration;
  }

  public set absoluteExpiration(value: Date | undefined) {
    this.#throwIfFrozen();
    this.#absoluteExpiration = value;
  }

  /**
   * An absolute expiration in milliseconds relative to now. Throws if not
   * positive, or if frozen.
   */
  public get absoluteExpirationRelativeToNow(): number | undefined {
    return this.#absoluteExpirationRelativeToNow;
  }

  public set absoluteExpirationRelativeToNow(value: number | undefined) {
    if (value !== undefined && value <= 0) {
      throw new RangeError(`absoluteExpirationRelativeToNow must be positive, was ${value}.`);
    }
    this.#throwIfFrozen();
    this.#absoluteExpirationRelativeToNow = value;
  }

  /**
   * How long (in milliseconds) the cache entry can be inactive (for example,
   * not accessed) before it will be removed. Does not extend the entry
   * lifetime beyond the absolute expiration (if set). Throws if not positive,
   * or if frozen.
   */
  public get slidingExpiration(): number | undefined {
    return this.#slidingExpiration;
  }

  public set slidingExpiration(value: number | undefined) {
    if (value !== undefined && value <= 0) {
      throw new RangeError(`slidingExpiration must be positive, was ${value}.`);
    }
    this.#throwIfFrozen();
    this.#slidingExpiration = value;
  }

  #throwIfFrozen(): void {
    if (frozenInstances.has(this)) {
      throw new Error("This DistributedCacheEntryOptions instance has been frozen and cannot be mutated.");
    }
  }
}

/**
 * Freezes `options`: every later setter call throws. The port of the
 * reference's internal `Freeze()`; deliberately absent from the package
 * barrel (see the module doc comment).
 */
export function freezeDistributedCacheEntryOptions(
  options: DistributedCacheEntryOptions,
): DistributedCacheEntryOptions {
  frozenInstances.add(options);
  return options;
}
