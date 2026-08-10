// Ships the real MemoryCache implementation, its `MemoryCacheOptions` bag
// (`MemoryCacheEntryOptions` lives in caching.core, re-exported here), the
// memory-backed MemoryDistributedCache (+ MemoryDistributedCacheOptions), and
// -- as a side effect -- registers `addMemoryCache` and
// `addDistributedMemoryCache` against di.core's `ServiceManifest`
// augmentation token.
//
// A consumer who only wants the sugar takes a bare side-effect import:
// `import "@rhombus-std/caching.memory";`. This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake the augmentation away.

export { MemoryCache } from './MemoryCache';
// Re-exported for source compatibility; the type itself lives in caching.core.
export { MemoryCacheEntryOptions } from '@rhombus-std/caching.core';
export { DISTRIBUTED_CACHE_TOKEN } from './distributed-cache-token';
export type { ISystemClock } from './ISystemClock';
export { MEMORY_CACHE_OPTIONS_TOKEN, MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN } from './memory-cache-options-token';
export { MEMORY_CACHE_TOKEN } from './memory-cache-token';
export { MemoryCacheOptions } from './MemoryCacheOptions';
export { MemoryDistributedCache } from './MemoryDistributedCache';
export { MemoryDistributedCacheOptions } from './MemoryDistributedCacheOptions';
export { ServiceManifestMemoryCacheAugmentations } from './ServiceManifest-MemoryCache-augmentations';
