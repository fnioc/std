// The di.core token the `IOptions<MemoryCacheOptions>` assembly registered by
// `addMemoryCache` is keyed at. The reference keys its options pipeline by the
// options TYPE (`Configure<MemoryCacheOptions>`); the "pkg:Type" token is the
// di.core analog of that type identity (the LOGGER_FILTER_OPTIONS_TOKEN
// precedent). A consumer appends further pipeline steps for the same token --
// e.g. `services.configure(MEMORY_CACHE_OPTIONS_TOKEN, section)` to bind a
// configuration section.

import { nameof } from '@rhombus-std/primitives';
import type { MemoryCacheOptions } from './MemoryCacheOptions';
import type { MemoryDistributedCacheOptions } from './MemoryDistributedCacheOptions';

/** Token for the `IOptions<MemoryCacheOptions>` assembly `addMemoryCache` registers. */
export const MEMORY_CACHE_OPTIONS_TOKEN = nameof<MemoryCacheOptions>();

/** Token for the `IOptions<MemoryDistributedCacheOptions>` assembly `addDistributedMemoryCache` registers. */
export const MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN = nameof<MemoryDistributedCacheOptions>();
