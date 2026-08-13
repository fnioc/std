import { getOrCreate } from '@rhombus-std/primitives';
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

  public constructor(init?: { expiration?: number; localCacheExpiration?: number; flags?: HybridCacheEntryFlags; }) {
    this.expiration = init?.expiration;
    this.localCacheExpiration = init?.localCacheExpiration;
    this.flags = init?.flags;
  }
}

const memoizedDistributedOptions = new WeakMap<HybridCacheEntryOptions, DistributedCacheEntryOptions>();

/**
 * Converts `options` to the `DistributedCacheEntryOptions` a backend distributed
 * cache consumes -- `undefined` when no expiration is set. Memoized per instance
 * (safe: the source properties are readonly). Not exported from the package barrel.
 */
export function toDistributedCacheEntryOptions(
  options: HybridCacheEntryOptions,
): DistributedCacheEntryOptions | undefined {
  if (options.expiration === undefined) {
    return undefined;
  }
  return getOrCreate(memoizedDistributedOptions, options, () => {
    const distributed = new DistributedCacheEntryOptions();
    distributed.absoluteExpirationRelativeToNow = options.expiration;
    return distributed;
  });
}
