# @rhombus-std/caching.memory

**A real, working in-memory cache — not just an interface.**

`@rhombus-std/caching.core` defines what a cache looks like; this package is
an actual implementation you can new up and use: absolute/sliding/token
expiration, a size limit with priority-then-LRU compaction, eviction
callbacks, hit/miss statistics, and a memory-backed `IDistributedCache` for
code paths that expect a distributed cache but only ever run on one process.

## Install

```sh
bun add @rhombus-std/caching.memory @rhombus-std/caching.core @rhombus-std/di.core @rhombus-std/di @rhombus-std/options
```

`@rhombus-std/caching.core` and `@rhombus-std/di.core` are peer dependencies —
install them alongside. `@rhombus-std/options` supplies `Options.of`, used
below to wrap a `MemoryCacheOptions` value as the `IOptions<T>` `MemoryCache`
expects. `@rhombus-std/di` is what turns a manifest into a resolvable
container; `@rhombus-std/caching.memory` doesn't depend on it itself, since
`getMemoryCacheManifest`/`getDistributedMemoryCacheManifest` only ever hand
you a manifest to merge.

## Usage

The hand-written form — no container required:

```ts
import { MemoryCache, MemoryCacheOptions } from '@rhombus-std/caching.memory';
import { Options } from '@rhombus-std/options';

const cache = new MemoryCache(Options.of(new MemoryCacheOptions()));

cache.set('greeting', 'hello'); // from @rhombus-std/caching.core's convenience wrappers
cache.get<string>('greeting'); // 'hello'
cache.remove('greeting');
```

`MemoryCache` takes its options as an `IOptions<MemoryCacheOptions>` rather
than a bare `MemoryCacheOptions` — `Options.of(value)` wraps a fixed value as
a static, non-reactive one; a container-resolved `MemoryCache` gets a live,
reload-reactive one instead (see below).

`MemoryCache` implements the `IMemoryCache` contract from
[`@rhombus-std/caching.core`](../caching.core/README.md), so every convenience
wrapper that package adds — `get`, `set`, `getOrCreate`, `setWithOptions`, and
friends — works on it directly.

### Registering it with a container

`getMemoryCacheManifest` builds the registration as its own manifest,
`Manifest<unknown>`: the cache itself registers at `'singleton'`, but a
`setup` callback folds in its own configure step, which carries no lifetime of
its own, so the manifest as a whole stays at the wider `unknown`. A caller
merges the result with `tryAdd`, spreading its registrations: that keeps the
semantics `tryAdd` always had here — an earlier registration for the same
type is kept, while configure steps still accumulate:

```ts
import type { IMemoryCache } from '@rhombus-std/caching.core';
import { getMemoryCacheManifest, MEMORY_CACHE_TYPE } from '@rhombus-std/caching.memory';
import { di, noopLifetimeAddon } from '@rhombus-std/di';
import { Manifest } from '@rhombus-std/di.core';

let services: Manifest<unknown> = Manifest.empty<unknown>();
services = services.tryAdd(...getMemoryCacheManifest((options) => {
  options.sizeLimit = 1024;
}));

const provider = di.usingLifetimeModel(noopLifetimeAddon()).usingManifest(services).build();
const cache: IMemoryCache = provider.resolve(MEMORY_CACHE_TYPE);
```

The `setup` callback runs lazily, the first time the options resolve, so it's
safe to merge `getMemoryCacheManifest` more than once and layer configuration
— each merge's configure step accumulates onto the same options pipeline
rather than replacing the one before it.

### A distributed-cache stand-in

`getDistributedMemoryCacheManifest` does the same for `IDistributedCache`,
backed by its own private `MemoryCache` instance (never the one
`getMemoryCacheManifest` registers):

```ts
import { getDistributedMemoryCacheManifest } from '@rhombus-std/caching.memory';

services = services.tryAdd(...getDistributedMemoryCacheManifest((options) => {
  options.sizeLimit = 50 * 1024 * 1024; // bytes; defaults to 200 MB
}));
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

| Export                                                               | What it is                                                                                                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MemoryCache`                                                        | The `IMemoryCache` implementation: `createEntry`, `tryGetValue`, `remove`, `clear`, `compact(percentage)`, `getCurrentStatistics()`, `count`, `keys`.       |
| `MemoryCacheOptions`                                                 | Configures a `MemoryCache` — `sizeLimit`, `compactionPercentage`, `expirationScanFrequency`, `trackStatistics`, `trackLinkedCacheEntries`, `clock`, `name`. |
| `MemoryCacheEntryOptions`                                            | Re-exported from `@rhombus-std/caching.core` for convenience — the per-entry options bag.                                                                   |
| `MemoryDistributedCache`                                             | An `IDistributedCache` implementation backed by a private `MemoryCache`; byte-payload `get`/`set`/`refresh`/`remove`.                                       |
| `MemoryDistributedCacheOptions`                                      | A `MemoryCacheOptions` subclass defaulting `sizeLimit` to 200 MB.                                                                                           |
| `getMemoryCacheManifest`, `getDistributedMemoryCacheManifest`        | Build the `IMemoryCache`/`IDistributedCache` registration (plus its options pipeline) as its own manifest — merge the result into your own with `tryAdd`.   |
| `MEMORY_CACHE_TYPE`, `DISTRIBUTED_CACHE_TYPE`                        | The addresses `getMemoryCacheManifest`/`getDistributedMemoryCacheManifest` register against.                                                                |
| `MEMORY_CACHE_OPTIONS_TYPE`, `MEMORY_DISTRIBUTED_CACHE_OPTIONS_TYPE` | The addresses their respective options pipelines resolve at.                                                                                                |
| `ISystemClock`                                                       | Interface for supplying a custom `utcNow` — plug in for deterministic expiration in tests.                                                                  |

## How it fits

`@rhombus-std/caching.memory` depends on
[`@rhombus-std/caching.core`](../caching.core/README.md) for the `IMemoryCache`/
`ICacheEntry`/`IDistributedCache` contracts and convenience wrappers, on
[`@rhombus-std/options`](../options/README.md) and
[`@rhombus-std/options.augmentations`](../options.augmentations/README.md) for
its options pipeline, on [`@rhombus-std/logging.core`](../logging.core/README.md)
for the optional logger it accepts, on
[`@rhombus-std/primitives`](../primitives/README.md) for the addresses
`getMemoryCacheManifest`/`getDistributedMemoryCacheManifest` register under,
and on its [`@rhombus-std/di.core`](../di.core/README.md) peer for the
`Manifest` they build on.

Install [`@rhombus-std/di`](../di/README.md) (or any container built on
`di.core`) to turn the merged manifest into a resolvable provider. If you
separately merge in [`@rhombus-std/logging`](../logging/README.md)'s
`getLoggingManifest`, the registered `MemoryCache` picks up the resolved
`ILoggerFactory` automatically; without it, the cache logs nowhere and works
exactly the same otherwise.

## Notes

- `getMemoryCacheManifest` and `getDistributedMemoryCacheManifest` are
  ordinary function exports, callable directly off a normal import — neither
  needs a side-effect import to unlock it.
- `MemoryCache` and `MemoryDistributedCache` are independent stores.
  `getDistributedMemoryCacheManifest` never reads from or writes to the cache
  `getMemoryCacheManifest` registers, even in the same process.
- Expiration is enforced lazily on access, plus a periodic sweep gated by
  `expirationScanFrequency` — an expired entry can still be returned by
  `tryGetValue` for a moment during a `Replaced` transition, matching how a
  concurrent-write race would read in a threaded runtime.
