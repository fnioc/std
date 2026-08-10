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

export { CacheEntrySugarAugmentations } from './CacheEntry-Sugar-augmentations';
export { MemoryCacheSugarAugmentations } from './MemoryCache-Sugar-augmentations';
export { MemoryCacheEntryOptionsSugarAugmentations } from './MemoryCacheEntryOptions-Sugar-augmentations';

// The distributed-cache surface (`freezeDistributedCacheEntryOptions` is
// intentionally not re-exported).
export { DistributedCacheSugarAugmentations } from './DistributedCache-Sugar-augmentations';
export { DistributedCacheEntryOptions } from './DistributedCacheEntryOptions';
export { DistributedCacheEntryOptionsSugarAugmentations } from './DistributedCacheEntryOptions-Sugar-augmentations';
export type { IDistributedCache } from './IDistributedCache';

// The hybrid-cache surface (`toDistributedCacheEntryOptions` is intentionally
// not re-exported).
export { HybridCache } from './hybrid/HybridCache';
export { HybridCacheEntryFlags } from './hybrid/HybridCacheEntryFlags';
export { HybridCacheEntryOptions } from './hybrid/HybridCacheEntryOptions';
export type { IHybridCacheSerializer } from './hybrid/IHybridCacheSerializer';
export type { IHybridCacheSerializerFactory } from './hybrid/IHybridCacheSerializerFactory';
