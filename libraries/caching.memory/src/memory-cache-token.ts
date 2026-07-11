// The explicit di.core token IMemoryCache is registered under by
// `addMemoryCache`. The reference runtime keys the DI registration on the
// `IMemoryCache` TYPE; this repo uses string tokens, so a consumer resolves
// the cache with `provider.resolve(MEMORY_CACHE_TOKEN)`.

/** The registration token for the `IMemoryCache` singleton `addMemoryCache` installs. */
export const MEMORY_CACHE_TOKEN = '@rhombus-std/caching.memory:IMemoryCache';
