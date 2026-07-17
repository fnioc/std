# @rhombus-std/caching.memory

**A real, working in-memory cache — not just an interface.**

`@rhombus-std/caching.core` defines what a cache looks like; this package is
an actual implementation you can new up and use: absolute/sliding/token
expiration, a size limit with priority-then-LRU compaction, eviction
callbacks, hit/miss statistics, and a memory-backed `IDistributedCache` for
code paths that expect a distributed cache but only ever run on one process.

## Install

```sh
bun add @rhombus-std/caching.memory @rhombus-std/caching.core
```

If you also want the fluent `manifest.addMemoryCache()` / `addDistributedMemoryCache()`
registration methods, install a dependency-injection container alongside it:

```sh
bun add @rhombus-std/di
```

## Usage

The hand-written form — no container required:

```ts
import { MemoryCache, MemoryCacheOptions } from '@rhombus-std/caching.memory';

const cache = new MemoryCache(new MemoryCacheOptions());

cache.set('greeting', 'hello'); // from @rhombus-std/caching.core's convenience wrappers
cache.get<string>('greeting'); // 'hello'
cache.remove('greeting');
```

`MemoryCache` implements the `IMemoryCache` contract from
[`@rhombus-std/caching.core`](../caching.core/README.md), so every convenience
wrapper that package adds — `get`, `set`, `getOrCreate`, `setWithOptions`, and
friends — works on it directly.

### Registering it with a container

Import the package for its side effect and a `ServiceManifest` gains
`addMemoryCache()`:

```ts
import '@rhombus-std/caching.memory';
import { ServiceManifest } from '@rhombus-std/di';

const manifest = new ServiceManifest()
  .addMemoryCache((options) => {
    options.sizeLimit = 1024;
  });
```

`addMemoryCache` registers the `IOptions<MemoryCacheOptions>` pipeline plus a
singleton `IMemoryCache`, resolvable through the `MEMORY_CACHE_TOKEN` string
this package exports. The `setup` callback runs lazily, the first time the
options resolve, so it's safe to call `addMemoryCache` more than once and
layer configuration.

### A distributed-cache stand-in

`addDistributedMemoryCache` does the same for `IDistributedCache`, backed by
its own private `MemoryCache` instance (never the one `addMemoryCache`
registers):

```ts
import '@rhombus-std/caching.memory';
import { ServiceManifest } from '@rhombus-std/di';

const manifest = new ServiceManifest()
  .addDistributedMemoryCache((options) => {
    options.sizeLimit = 50 * 1024 * 1024; // bytes; defaults to 200 MB
  });
```

Useful for local development or single-instance deployments where code is
written against `IDistributedCache` but there's no actual distributed store
to talk to. Entries are sized by their byte length, so the size limit here is
a real memory budget, not an arbitrary unit.

## Expiration, size, and eviction

`MemoryCacheOptions` controls the cache's behavior:

```ts
const options = new MemoryCacheOptions();
options.sizeLimit = 10_000; // undefined by default: unbounded
options.compactionPercentage = 0.1; // fraction removed once the limit is hit
options.expirationScanFrequency = 30_000; // ms between background expiry sweeps
options.trackStatistics = true; // enables getCurrentStatistics()
options.trackLinkedCacheEntries = true; // nested-entry expiration propagation
```

Per-entry settings — absolute expiration, sliding expiration, expiration
tokens, priority, size — go through `ICacheEntry` (via `createEntry`/`set*`)
or `MemoryCacheEntryOptions`, both defined in `@rhombus-std/caching.core`.
When the size limit is exceeded, entries are compacted expired-first, then by
priority bucket, least-recently-used within a bucket — `CacheItemPriority.NeverRemove`
entries are never compacted away.

```ts
if (options.trackStatistics) {
  const stats = cache.getCurrentStatistics();
  stats?.totalHits;
  stats?.totalMisses;
  stats?.currentEntryCount;
}
```

## Key exports

| Export                                                                 | What it is                                                                                                                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MemoryCache`                                                          | The `IMemoryCache` implementation: `createEntry`, `tryGetValue`, `remove`, `clear`, `compact(percentage)`, `getCurrentStatistics()`, `count`, `keys`.       |
| `MemoryCacheOptions`                                                   | Configures a `MemoryCache` — `sizeLimit`, `compactionPercentage`, `expirationScanFrequency`, `trackStatistics`, `trackLinkedCacheEntries`, `clock`, `name`. |
| `MemoryCacheEntryOptions`                                              | Re-exported from `@rhombus-std/caching.core` for convenience — the per-entry options bag.                                                                   |
| `MemoryDistributedCache`                                               | An `IDistributedCache` implementation backed by a private `MemoryCache`; byte-payload `get`/`set`/`refresh`/`remove`.                                       |
| `MemoryDistributedCacheOptions`                                        | A `MemoryCacheOptions` subclass defaulting `sizeLimit` to 200 MB.                                                                                           |
| `MEMORY_CACHE_TOKEN`, `DISTRIBUTED_CACHE_TOKEN`                        | The resolution tokens `addMemoryCache`/`addDistributedMemoryCache` register against.                                                                        |
| `MEMORY_CACHE_OPTIONS_TOKEN`, `MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN` | The tokens their respective options pipelines resolve at.                                                                                                   |
| `ISystemClock`                                                         | Interface for supplying a custom `utcNow` — plug in for deterministic expiration in tests.                                                                  |

## How it fits

`@rhombus-std/caching.memory` depends on
[`@rhombus-std/caching.core`](../caching.core/README.md) for the `IMemoryCache`/
`ICacheEntry`/`IDistributedCache` contracts and convenience wrappers, on
[`@rhombus-std/options`](../options/README.md) and
[`@rhombus-std/options.augmentations`](../options.augmentations/README.md) for
its options pipeline, on
[`@rhombus-std/logging.core`](../logging.core/README.md) for the optional
logger it accepts, and on
[`@rhombus-std/primitives`](../primitives/README.md) for the augmentation
plumbing that installs `addMemoryCache`/`addDistributedMemoryCache`.

Those two registration methods land on
[`@rhombus-std/di.core`](../di.core/README.md)'s `ServiceManifest` — install
[`@rhombus-std/di`](../di/README.md) (or any container built on `di.core`) to
call them from a builder. If you separately install
[`@rhombus-std/logging`](../logging/README.md)'s `addLogging`, the registered
`MemoryCache` picks up the resolved `ILoggerFactory` automatically; without
it, the cache logs nowhere and works exactly the same otherwise.

## Notes

- `addMemoryCache` and `addDistributedMemoryCache` are only available once
  you've imported `@rhombus-std/caching.memory` somewhere in your program —
  it's a side-effect import. This package ships `"sideEffects": true` in its
  `package.json` specifically so a bundler won't tree-shake that import away.
- `MemoryCache` and `MemoryDistributedCache` are independent stores.
  `addDistributedMemoryCache` never reads from or writes to the cache
  `addMemoryCache` registers, even in the same process.
- Expiration is enforced lazily on access, plus a periodic sweep gated by
  `expirationScanFrequency` — an expired entry can still be returned by
  `tryGetValue` for a moment during a `Replaced` transition, matching how a
  concurrent-write race would read in a threaded runtime.
