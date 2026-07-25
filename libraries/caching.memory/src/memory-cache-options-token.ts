// A consumer appends further pipeline steps against this same token -- e.g.
// `services.configure(MEMORY_CACHE_OPTIONS_TOKEN, section)` to bind a
// configuration section.

import { tokenfor } from '@rhombus-std/primitives.extras';
import type { MemoryCacheOptions } from './MemoryCacheOptions';
import type { MemoryDistributedCacheOptions } from './MemoryDistributedCacheOptions';

/** Token for the `IOptions<MemoryCacheOptions>` assembly `addMemoryCache` registers. */
export const MEMORY_CACHE_OPTIONS_TOKEN = tokenfor<MemoryCacheOptions>();

/** Token for the `IOptions<MemoryDistributedCacheOptions>` assembly `addDistributedMemoryCache` registers. */
export const MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN = tokenfor<MemoryDistributedCacheOptions>();
