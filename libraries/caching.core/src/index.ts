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

export { CacheItemPriority } from "./cache-item-priority";
export { EvictionReason } from "./eviction-reason";
export { PostEvictionCallbackRegistration } from "./post-eviction-callback-registration";
export type { PostEvictionDelegate } from "./post-eviction-delegate";

export type { ICacheEntry } from "./cache-entry";
export type { CacheTryGetResult, IMemoryCache } from "./memory-cache";
export { MemoryCacheEntryOptions } from "./memory-cache-entry-options";

export { CacheExtensions } from "./cache-augmentations";
export { CacheEntryExtensions } from "./cache-entry-augmentations";
