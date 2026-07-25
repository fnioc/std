import type { IDistributedCache } from '@rhombus-std/caching.core';
import { tokenfor } from '@rhombus-std/primitives.extras';

/** The registration token for the `IDistributedCache` singleton `addDistributedMemoryCache` installs. */
export const DISTRIBUTED_CACHE_TOKEN = tokenfor<IDistributedCache>();
