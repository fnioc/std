import type { IDistributedCache } from '@rhombus-std/caching.core';
import type { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

/** The `IDistributedCache` singleton `addDistributedMemoryCache` installs. */
export const DISTRIBUTED_CACHE_TYPE: Type = typefor<IDistributedCache>();
