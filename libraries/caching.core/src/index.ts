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

export { CacheItemPriority } from "./CacheItemPriority";
export { EvictionReason } from "./EvictionReason";
export { PostEvictionCallbackRegistration } from "./PostEvictionCallbackRegistration";
export type { PostEvictionDelegate } from "./PostEvictionDelegate";

export type { ICacheEntry } from "./ICacheEntry";
export type { CacheTryGetResult, IMemoryCache } from "./memory-cache";
export { MemoryCacheEntryOptions } from "./MemoryCacheEntryOptions";

export { CacheExtensions } from "./cache-augmentations";
export { CacheEntryExtensions } from "./cache-entry-augmentations";
export { MemoryCacheEntryExtensions } from "./cache-entry-options-augmentations";

// The distributed-cache surface. `freezeDistributedCacheEntryOptions` is
// deliberately NOT re-exported (it mirrors the reference's internal Freeze).
export { type DistributedCacheExtensionMethods, DistributedCacheExtensions } from "./distributed-cache-augmentations";
export { DistributedCacheEntryExtensions } from "./distributed-cache-entry-augmentations";
export { DistributedCacheEntryOptions } from "./DistributedCacheEntryOptions";
export type { IDistributedCache } from "./IDistributedCache";

// The hybrid-cache surface. `toDistributedCacheEntryOptions` is deliberately
// NOT re-exported (it mirrors the reference's internal
// ToDistributedCacheEntryOptions).
export { HybridCache } from "./Hybrid/HybridCache";
export { HybridCacheEntryFlags } from "./Hybrid/HybridCacheEntryFlags";
export { HybridCacheEntryOptions } from "./Hybrid/HybridCacheEntryOptions";
export type { IHybridCacheSerializer } from "./Hybrid/IHybridCacheSerializer";
export type { IHybridCacheSerializerFactory } from "./Hybrid/IHybridCacheSerializerFactory";
