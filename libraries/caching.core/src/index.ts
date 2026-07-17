// Public entry point for @rhombus-std/caching.core -- the
// ME.Caching.Abstractions analog. Ships the in-memory cache contracts
// (IMemoryCache/ICacheEntry), the distributed cache contract
// (IDistributedCache + DistributedCacheEntryOptions), the enums and callback
// types (CacheItemPriority/EvictionReason/PostEvictionDelegate/
// PostEvictionCallbackRegistration), the per-entry options bag
// (MemoryCacheEntryOptions -- placed here as ME has it in Abstractions), and
// the real-runtime convenience wrappers (get/set/getOrCreate/setWithOptions/...
// on IMemoryCache; setPriority/addExpirationToken/setOptions/... on ICacheEntry;
// the fluent setPriority/setSize/setAbsoluteExpiration/... bag builders on
// MemoryCacheEntryOptions; set/setString/getString on IDistributedCache;
// setAbsoluteExpiration/setSlidingExpiration on DistributedCacheEntryOptions),
// plus the hybrid-cache abstractions (the reference's Hybrid/ subsystem:
// HybridCache, HybridCacheEntryOptions/Flags, IHybridCacheSerializer and its
// factory -- abstractions only, the concrete multi-tier cache lives in its own
// reference package with no std analog yet).
//
// Mirror of the reference edge `Caching.Abstractions -> Primitives`: the only
// external std dependency is @rhombus-std/primitives -- the `IChangeToken`/
// `AbortSignal`/`Token` types plus the augmentation registry runtime.

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

// The distributed-cache surface. `freezeDistributedCacheEntryOptions` is
// deliberately NOT re-exported (it mirrors the reference's internal Freeze).
export { DistributedCacheEntryExtensions } from './DistributedCacheEntryExtensions';
export { DistributedCacheEntryOptions } from './DistributedCacheEntryOptions';
export { DistributedCacheExtensions } from './DistributedCacheExtensions';
export type { IDistributedCache } from './IDistributedCache';

// The hybrid-cache surface. `toDistributedCacheEntryOptions` is deliberately
// NOT re-exported (it mirrors the reference's internal
// ToDistributedCacheEntryOptions).
export { HybridCache } from './hybrid/HybridCache';
export { HybridCacheEntryFlags } from './hybrid/HybridCacheEntryFlags';
export { HybridCacheEntryOptions } from './hybrid/HybridCacheEntryOptions';
export type { IHybridCacheSerializer } from './hybrid/IHybridCacheSerializer';
export type { IHybridCacheSerializerFactory } from './hybrid/IHybridCacheSerializerFactory';
