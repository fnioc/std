// The explicit di.core token IMemoryCache is registered under by
// `addMemoryCache`. The reference runtime keys the DI registration on the
// `IMemoryCache` TYPE; this repo uses string tokens, so a consumer resolves
// the cache with `provider.resolve(MEMORY_CACHE_TOKEN)`. Derived via
// `tokenfor<IMemoryCache>()` so the token keys the type's DECLARING package
// (caching.core), the same grammar every other framework token uses.

import type { IMemoryCache } from '@rhombus-std/caching.core';
import { tokenfor } from '@rhombus-std/primitives.extras';

/** The registration token for the `IMemoryCache` singleton `addMemoryCache` installs. */
export const MEMORY_CACHE_TOKEN = tokenfor<IMemoryCache>();
