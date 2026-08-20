// Ships the real MemoryCache implementation, its `MemoryCacheOptions` bag
// (`MemoryCacheEntryOptions` lives in caching.core, re-exported here), the
// memory-backed MemoryDistributedCache (+ MemoryDistributedCacheOptions), and
// -- as a side effect -- registers `addMemoryCache` and
// `addDistributedMemoryCache` against di.core's `Manifest`
// augmentation type.
//
// A consumer who only wants the sugar takes a bare side-effect import:
// `import "@rhombus-std/caching.memory";`. This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake the augmentation away.

export * from './MemoryCache';
// Re-exported for source compatibility; the type itself lives in caching.core.
export { MemoryCacheEntryOptions } from '@rhombus-std/caching.core';
export * from './DefaultManifest-MemoryCache-augmentations';
export * from './distributed-cache-type';
export type * from './ISystemClock';
export * from './memory-cache-options-type';
export * from './memory-cache-type';
export * from './MemoryCacheOptions';
export * from './MemoryDistributedCache';
export * from './MemoryDistributedCacheOptions';
