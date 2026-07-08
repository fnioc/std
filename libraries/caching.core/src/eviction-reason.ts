// EvictionReason -- ported verbatim from ME.Caching.Abstractions'
// EvictionReason. Passed to a PostEvictionDelegate so a callback can tell why
// its entry left the cache.

/** Specifies the reasons why an entry was evicted from the cache. */
export enum EvictionReason {
  /** The item was not removed from the cache. */
  None,

  /** The item was removed manually via {@link IMemoryCache.remove}. */
  Removed,

  /** The item was removed because it was overwritten. */
  Replaced,

  /** The item was removed because it timed out. */
  Expired,

  /** The item was removed because one of its expiration tokens expired. */
  TokenExpired,

  /** The item was removed because it exceeded the cache's size limit. */
  Capacity,
}
