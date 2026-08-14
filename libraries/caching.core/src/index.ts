// Public entry point for @rhombus-std/caching.core: the in-memory and
// distributed cache contracts, their options and convenience methods, and the
// hybrid-cache abstractions.

export * from './CacheItemPriority';
export * from './EvictionReason';
export * from './PostEvictionCallbackRegistration';
export type * from './PostEvictionDelegate';

export type * from './ICacheEntry';
export type * from './IMemoryCache';
export * from './MemoryCacheEntryOptions';
export * from './MemoryCacheStatistics';

export * from './CacheEntry-Sugar-augmentations';
export * from './MemoryCache-Sugar-augmentations';
export * from './MemoryCacheEntryOptions-Sugar-augmentations';

// The distributed-cache surface (`freezeDistributedCacheEntryOptions` is
// intentionally not re-exported).
export * from './DistributedCache-Sugar-augmentations';
export { DistributedCacheEntryOptions } from './DistributedCacheEntryOptions';
export * from './DistributedCacheEntryOptions-Sugar-augmentations';
export type * from './IDistributedCache';

// The hybrid-cache surface (`toDistributedCacheEntryOptions` is intentionally
// not re-exported).
export * from './hybrid/HybridCache';
export * from './hybrid/HybridCacheEntryFlags';
export { HybridCacheEntryOptions } from './hybrid/HybridCacheEntryOptions';
export type * from './hybrid/IHybridCacheSerializer';
export type * from './hybrid/IHybridCacheSerializerFactory';
