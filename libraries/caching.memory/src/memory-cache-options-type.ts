// A consumer appends further pipeline steps against this same type -- e.g.
// `services.configure(MEMORY_CACHE_OPTIONS_TYPE, section)` to bind a
// configuration section.

import type { IOptions } from '@rhombus-std/options';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { MemoryCacheOptions } from './MemoryCacheOptions';
import type { MemoryDistributedCacheOptions } from './MemoryDistributedCacheOptions';

/** The options type `addMemoryCache` offers. */
export const MEMORY_CACHE_OPTIONS_TYPE: Type = typefor<MemoryCacheOptions>();

/** The address `MemoryCache` takes its options from. */
export const MEMORY_CACHE_OPTIONS_ACCESSOR_TYPE: Type = typefor<IOptions<MemoryCacheOptions>>();

/** The options type `addDistributedMemoryCache` offers. */
export const MEMORY_DISTRIBUTED_CACHE_OPTIONS_TYPE: Type = typefor<MemoryDistributedCacheOptions>();

/** The address `MemoryDistributedCache` takes its options from. */
export const MEMORY_DISTRIBUTED_CACHE_OPTIONS_ACCESSOR_TYPE: Type = typefor<IOptions<MemoryDistributedCacheOptions>>();
