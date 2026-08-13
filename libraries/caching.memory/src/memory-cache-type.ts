import type { IMemoryCache } from '@rhombus-std/caching.core';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

/** The `IMemoryCache` singleton `addMemoryCache` installs. */
export const MEMORY_CACHE_TYPE: Type = typefor<IMemoryCache>();
