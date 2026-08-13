// Ships the real MemoryCache implementation, its `MemoryCacheOptions` bag
// (`MemoryCacheEntryOptions` lives in caching.core, re-exported here), the
// memory-backed MemoryDistributedCache (+ MemoryDistributedCacheOptions), and
// -- as a side effect -- registers `addMemoryCache` and
// `addDistributedMemoryCache` against di.core's `Manifest`
// augmentation token.
//
// A consumer who only wants the sugar takes a bare side-effect import:
// `import "@rhombus-std/caching.memory";`. This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake the augmentation away.

export { MemoryCache } from './MemoryCache';
// Re-exported for source compatibility; the type itself lives in caching.core.
export { MemoryCacheEntryOptions } from '@rhombus-std/caching.core';
export { ServiceManifestMemoryCacheAugmentations } from './DefaultManifest-MemoryCache-augmentations';
export { DISTRIBUTED_CACHE_TYPE } from './distributed-cache-type';
export type { ISystemClock } from './ISystemClock';
export { MEMORY_CACHE_OPTIONS_ACCESSOR_TYPE, MEMORY_CACHE_OPTIONS_TYPE, MEMORY_DISTRIBUTED_CACHE_OPTIONS_ACCESSOR_TYPE,
  MEMORY_DISTRIBUTED_CACHE_OPTIONS_TYPE } from './memory-cache-options-type';
export { MEMORY_CACHE_TYPE } from './memory-cache-type';
export { MemoryCacheOptions } from './MemoryCacheOptions';
export { MemoryDistributedCache } from './MemoryDistributedCache';
export { MemoryDistributedCacheOptions } from './MemoryDistributedCacheOptions';
