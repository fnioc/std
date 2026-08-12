// A consumer appends further pipeline steps against this same type -- e.g.
// `services.configure(MEMORY_CACHE_OPTIONS_TYPE, section)` to bind a
// configuration section.

import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { MemoryCacheOptions } from './MemoryCacheOptions';
import type { MemoryDistributedCacheOptions } from './MemoryDistributedCacheOptions';

/** The `IOptions<MemoryCacheOptions>` assembly `addMemoryCache` registers. */
export const MEMORY_CACHE_OPTIONS_TYPE: Type = typefor<MemoryCacheOptions>();

/** The `IOptions<MemoryDistributedCacheOptions>` assembly `addDistributedMemoryCache` registers. */
export const MEMORY_DISTRIBUTED_CACHE_OPTIONS_TYPE: Type = typefor<MemoryDistributedCacheOptions>();
