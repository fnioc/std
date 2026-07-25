import type { IMemoryCache } from '@rhombus-std/caching.core';
import { tokenfor } from '@rhombus-std/primitives.extras';

/** The registration token for the `IMemoryCache` singleton `addMemoryCache` installs. */
export const MEMORY_CACHE_TOKEN = tokenfor<IMemoryCache>();
