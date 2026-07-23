// The explicit di.core token IDistributedCache is registered under by
// `addDistributedMemoryCache`. The reference runtime keys the DI registration
// on the `IDistributedCache` TYPE; this repo uses string tokens, so a consumer
// resolves the cache with `provider.resolve(DISTRIBUTED_CACHE_TOKEN)`. Derived
// via `tokenfor<IDistributedCache>()` so the token keys the type's DECLARING
// package (caching.core), the same grammar every other framework token uses.

import type { IDistributedCache } from '@rhombus-std/caching.core';
import { tokenfor } from '@rhombus-std/primitives';

/** The registration token for the `IDistributedCache` singleton `addDistributedMemoryCache` installs. */
export const DISTRIBUTED_CACHE_TOKEN = tokenfor<IDistributedCache>();
