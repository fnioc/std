// HybridCacheEntryOptions -- ported from ME.Caching.Abstractions'
// Hybrid/HybridCacheEntryOptions.
//
// Platform adaptations from the reference:
//   - The init-only properties (`{ get; init; }` on a sealed class) map to
//     readonly properties assigned from an optional constructor init bag --
//     the closest analog of the reference's object-initializer authoring.
//   - `TimeSpan?` durations are milliseconds (the family convention, as in
//     DistributedCacheEntryOptions).
//   - The internal memoized `ToDistributedCacheEntryOptions()` ports as the
//     module-scoped `toDistributedCacheEntryOptions` below -- exported from
//     this module for the family's own use, but NOT from the package barrel,
//     mirroring the reference's `internal` visibility (the
//     `freezeDistributedCacheEntryOptions` precedent). The reference's private
//     `_dc` memo field becomes the module-scoped WeakMap.

import { DistributedCacheEntryOptions } from '../DistributedCacheEntryOptions';
import type { HybridCacheEntryFlags } from './HybridCacheEntryFlags';

/**
 * Specifies additional options (for example, expiration) that apply to a
 * `HybridCache` operation. When options can be specified at multiple levels
 * (for example, globally and per-call), the values are composed; the most
 * granular non-`undefined` value is used, with `undefined` values being
 * inherited. If no value is specified at any level, the implementation can
 * choose a reasonable default.
 */
export class HybridCacheEntryOptions {
  /**
   * The overall cache duration of this entry, in milliseconds, passed to the
   * backend distributed cache.
   */
  public readonly expiration: number | undefined;

  /**
   * The cache duration of this entry, in milliseconds, in the local
   * in-process cache. When retrieving a cached value from an external cache
   * store, this value will be used to calculate the local cache expiration,
   * not exceeding the remaining overall cache lifetime.
   */
  public readonly localCacheExpiration: number | undefined;

  /** Additional flags that apply to the requested operation. */
  public readonly flags: HybridCacheEntryFlags | undefined;

  public constructor(init?: {
    expiration?: number;
    localCacheExpiration?: number;
    flags?: HybridCacheEntryFlags;
  }) {
    this.expiration = init?.expiration;
    this.localCacheExpiration = init?.localCacheExpiration;
    this.flags = init?.flags;
  }
}

/** The memoized conversions -- the analog of the reference's private `_dc` field. */
const memoizedDistributedOptions = new WeakMap<HybridCacheEntryOptions, DistributedCacheEntryOptions>();

/**
 * Converts `options` to the `DistributedCacheEntryOptions` a backend
 * distributed cache consumes -- `undefined` when no expiration is set. The
 * conversion is memoized per instance (safe: the properties are readonly).
 * The port of the reference's internal `ToDistributedCacheEntryOptions()`;
 * deliberately absent from the package barrel (see the module doc comment).
 */
export function toDistributedCacheEntryOptions(
  options: HybridCacheEntryOptions,
): DistributedCacheEntryOptions | undefined {
  if (options.expiration === undefined) {
    return undefined;
  }
  let distributed = memoizedDistributedOptions.get(options);
  if (distributed === undefined) {
    distributed = new DistributedCacheEntryOptions();
    distributed.absoluteExpirationRelativeToNow = options.expiration;
    memoizedDistributedOptions.set(options, distributed);
  }
  return distributed;
}
