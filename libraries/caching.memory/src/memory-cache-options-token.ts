// The di.core token the `Options<MemoryCacheOptions>` assembly registered by
// `addMemoryCache` is keyed at. The reference keys its options pipeline by the
// options TYPE (`Configure<MemoryCacheOptions>`); the "pkg:Type" token is the
// di.core analog of that type identity (the LOGGER_FILTER_OPTIONS_TOKEN
// precedent). A consumer appends further pipeline steps for the same token --
// e.g. `services.configure(MEMORY_CACHE_OPTIONS_TOKEN, section)` to bind a
// configuration section.

/** Token for the `Options<MemoryCacheOptions>` assembly `addMemoryCache` registers. */
export const MEMORY_CACHE_OPTIONS_TOKEN = '@rhombus-std/caching.memory:MemoryCacheOptions';

/** Token for the `Options<MemoryDistributedCacheOptions>` assembly `addDistributedMemoryCache` registers. */
export const MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN = '@rhombus-std/caching.memory:MemoryDistributedCacheOptions';
