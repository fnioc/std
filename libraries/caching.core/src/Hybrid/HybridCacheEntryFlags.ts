// HybridCacheEntryFlags -- ported verbatim from ME.Caching.Abstractions'
// Hybrid/HybridCacheEntryFlags, a `[Flags]` enum: members combine bitwise,
// and the two `Disable*Cache` members are the read|write combinations.

/**
 * Additional flags that apply to a `HybridCache` operation. A `[Flags]`-style
 * enum: members combine bitwise.
 */
export enum HybridCacheEntryFlags {
  /** No additional flags. */
  None = 0,

  /** Disables reading from the local in-process cache. */
  DisableLocalCacheRead = 1 << 0,

  /** Disables writing to the local in-process cache. */
  DisableLocalCacheWrite = 1 << 1,

  /** Disables both reading from and writing to the local in-process cache. */
  DisableLocalCache = DisableLocalCacheRead | DisableLocalCacheWrite,

  /** Disables reading from the secondary distributed cache. */
  DisableDistributedCacheRead = 1 << 2,

  /** Disables writing to the secondary distributed cache. */
  DisableDistributedCacheWrite = 1 << 3,

  /** Disables both reading from and writing to the secondary distributed cache. */
  DisableDistributedCache = DisableDistributedCacheRead | DisableDistributedCacheWrite,

  /** Only fetches the value from cache; does not attempt to access the underlying data store. */
  DisableUnderlyingData = 1 << 4,

  /** Disables compression for this payload. */
  DisableCompression = 1 << 5,
}
