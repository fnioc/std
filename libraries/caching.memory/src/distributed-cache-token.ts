// The explicit di.core token IDistributedCache is registered under by
// `addDistributedMemoryCache`. The reference runtime keys the DI registration
// on the `IDistributedCache` TYPE; this repo uses string tokens, so a consumer
// resolves the cache with `provider.resolve(DISTRIBUTED_CACHE_TOKEN)`.

/** The registration token for the `IDistributedCache` singleton `addDistributedMemoryCache` installs. */
export const DISTRIBUTED_CACHE_TOKEN = '@rhombus-std/caching.memory:IDistributedCache';
