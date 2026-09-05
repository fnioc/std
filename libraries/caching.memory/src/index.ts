// Ships the real MemoryCache implementation, its `MemoryCacheOptions` bag
// (`MemoryCacheEntryOptions` lives in caching.core, re-exported here), the
// memory-backed MemoryDistributedCache (+ MemoryDistributedCacheOptions), and
// `getMemoryCacheManifest`/`getDistributedMemoryCacheManifest` -- the
// registrations a consumer merges into their own manifest to add either
// cache.

export * from './MemoryCache';
// Re-exported for source compatibility; the type itself lives in caching.core.
export { MemoryCacheEntryOptions } from '@rhombus-std/caching.core';
export * from './distributed-cache-type';
export type * from './ISystemClock';
export * from './manifests';
export * from './memory-cache-options-type';
export * from './memory-cache-type';
export * from './MemoryCacheOptions';
export * from './MemoryDistributedCache';
export * from './MemoryDistributedCacheOptions';
