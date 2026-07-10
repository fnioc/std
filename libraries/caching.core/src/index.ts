// Public entry point for @rhombus-std/caching.core -- the
// ME.Caching.Abstractions analog. Ships the in-memory cache contracts
// (IMemoryCache/ICacheEntry), the enums and callback types
// (CacheItemPriority/EvictionReason/PostEvictionDelegate/
// PostEvictionCallbackRegistration), the per-entry options bag
// (MemoryCacheEntryOptions -- placed here as ME has it in Abstractions), and
// the real-runtime convenience wrappers (get/set/getOrCreate/setWithOptions/...
// on IMemoryCache; setPriority/addExpirationToken/setOptions/... on ICacheEntry).
//
// Mirror of the reference edge `Caching.Abstractions -> Primitives`: the only
// external dependency is @rhombus-std/primitives, for the `IChangeToken` type
// an expiration token flows through.

export { CacheItemPriority } from "./CacheItemPriority";
export { EvictionReason } from "./EvictionReason";
export { PostEvictionCallbackRegistration } from "./PostEvictionCallbackRegistration";
export type { PostEvictionDelegate } from "./PostEvictionDelegate";

export type { ICacheEntry } from "./ICacheEntry";
export type { CacheTryGetResult, IMemoryCache } from "./memory-cache";
export { MemoryCacheEntryOptions } from "./MemoryCacheEntryOptions";

export { CacheExtensions } from "./cache-augmentations";
export { CacheEntryExtensions } from "./cache-entry-augmentations";
