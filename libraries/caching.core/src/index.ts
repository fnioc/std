// Public entry point for @rhombus-std/caching.core: the in-memory and
// distributed cache contracts, their options and convenience methods, and the
// hybrid-cache abstractions.

export { CacheItemPriority } from './CacheItemPriority';
export { EvictionReason } from './EvictionReason';
export { PostEvictionCallbackRegistration } from './PostEvictionCallbackRegistration';
export type { PostEvictionDelegate } from './PostEvictionDelegate';

export type { ICacheEntry } from './ICacheEntry';
export type { CacheTryGetResult, IMemoryCache } from './IMemoryCache';
export { MemoryCacheEntryOptions } from './MemoryCacheEntryOptions';
export { MemoryCacheStatistics } from './MemoryCacheStatistics';

export { CacheEntryExtensions } from './CacheEntryExtensions';
export { CacheExtensions } from './CacheExtensions';
export { MemoryCacheEntryExtensions } from './MemoryCacheEntryExtensions';

// The distributed-cache surface (`freezeDistributedCacheEntryOptions` is
// intentionally not re-exported).
export { DistributedCacheEntryExtensions } from './DistributedCacheEntryExtensions';
export { DistributedCacheEntryOptions } from './DistributedCacheEntryOptions';
export { DistributedCacheExtensions } from './DistributedCacheExtensions';
export type { IDistributedCache } from './IDistributedCache';

// The hybrid-cache surface (`toDistributedCacheEntryOptions` is intentionally
// not re-exported).
export { HybridCache } from './hybrid/HybridCache';
export { HybridCacheEntryFlags } from './hybrid/HybridCacheEntryFlags';
export { HybridCacheEntryOptions } from './hybrid/HybridCacheEntryOptions';
export type { IHybridCacheSerializer } from './hybrid/IHybridCacheSerializer';
export type { IHybridCacheSerializerFactory } from './hybrid/IHybridCacheSerializerFactory';
