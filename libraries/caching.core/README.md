# @rhombus-std/caching.core

**The cache contracts a memory or distributed cache implements — and the
convenience methods that come free once it does.**

This package has no cache of its own. It defines what an
`IMemoryCache`/`ICacheEntry` pair looks like, what an `IDistributedCache`
looks like, and the multi-tier `HybridCache` abstractions — plus a set of
`get`/`set`/`getOrCreate`/`setString`/`getString`-style wrappers that build on
those contracts so an implementer only has to write the small primitive
surface, not the sugar around it.

## Install

```sh
bun add @rhombus-std/caching.core

# a concrete in-memory implementation
bun add @rhombus-std/caching.memory
```

`caching.core` on its own gives you types and a fluent options builder to
code against; you need a real implementation (such as
[`@rhombus-std/caching.memory`](../caching.memory/README.md)) to actually
store anything.

## Usage

Code against `IMemoryCache` and get the convenience methods for free —
no transformer, no extra import, just a concrete cache instance:

```ts
import type { IMemoryCache } from '@rhombus-std/caching.core';

function greet(cache: IMemoryCache, name: string): string {
  return cache.getOrCreate(`greeting:${name}`, () => `Hello, ${name}!`) ?? '';
}
```

`getOrCreate` returns the cached value if `name`'s key is already present;
otherwise it runs the factory, stores the result, and returns it. Any object
implementing `IMemoryCache`'s three primitive members
(`tryGetValue`/`createEntry`/`remove`) picks up `get`, `set`, `getOrCreate`,
`getOrCreateAsync`, and the `*WithOptions` variants automatically, because
those are installed as methods the moment the concrete class is decorated for
the `IMemoryCache` receiver.

Build a reusable options bag fluently and apply it to many entries:

```ts
import { CacheItemPriority,
  MemoryCacheEntryOptions } from '@rhombus-std/caching.core';

const options = new MemoryCacheEntryOptions()
  .setSlidingExpiration(5 * 60 * 1000) // 5 minutes, in ms
  .setPriority(CacheItemPriority.High);

cache.setWithOptions('session:abc', sessionData, options);
```

## Key exports

| Export                                                                                                                                   | What it is                                                                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IMemoryCache`                                                                                                                           | The in-memory cache contract: `tryGetValue`, `createEntry`, `remove`, `getCurrentStatistics`.                                                                                                     |
| `ICacheEntry`                                                                                                                            | A single entry, returned by `createEntry`; committed to the cache when disposed. Carries expiration, priority, size, and eviction callbacks.                                                      |
| `MemoryCacheEntryOptions`                                                                                                                | A reusable, fluent options bag (`setPriority`/`setSize`/`setAbsoluteExpiration`/`setSlidingExpiration`/`addExpirationToken`/`registerPostEvictionCallback`) applied to an entry via `setOptions`. |
| `MemoryCacheStatistics`                                                                                                                  | An immutable snapshot returned by `getCurrentStatistics()`: entry count, estimated size, hits, misses, evictions.                                                                                 |
| `CacheItemPriority`                                                                                                                      | `Low` / `Normal` / `High` / `NeverRemove` — how an entry is prioritized during a size-limited compaction.                                                                                         |
| `EvictionReason`                                                                                                                         | Why an entry left the cache — passed to a `PostEvictionDelegate`.                                                                                                                                 |
| `PostEvictionCallbackRegistration`, `PostEvictionDelegate`                                                                               | The eviction-callback pairing and its signature.                                                                                                                                                  |
| `IDistributedCache`                                                                                                                      | A remote, serialized-value cache contract: `get`/`set`/`refresh`/`remove`, all `Promise`-returning.                                                                                               |
| `DistributedCacheEntryOptions`                                                                                                           | Absolute/sliding expiration for a distributed-cache entry (`setAbsoluteExpiration`/`setSlidingExpiration`).                                                                                       |
| `HybridCache`                                                                                                                            | Abstract multi-tier cache (local + distributed) surface: `getOrCreate`/`set`/`remove`/`removeKeys`/`removeByTag`/`removeByTags`.                                                                  |
| `HybridCacheEntryOptions`, `HybridCacheEntryFlags`                                                                                       | Per-operation `HybridCache` options and the flags controlling which tier(s) participate.                                                                                                          |
| `IHybridCacheSerializer<T>`, `IHybridCacheSerializerFactory`                                                                             | Per-type payload (de)serialization plumbing for a `HybridCache` implementation.                                                                                                                   |
| `CacheExtensions`, `CacheEntryExtensions`, `MemoryCacheEntryExtensions`, `DistributedCacheExtensions`, `DistributedCacheEntryExtensions` | The augmentation objects backing the convenience methods above — call them directly (`CacheExtensions.get(cache, key)`) if you'd rather not rely on the merged method form.                       |

Every convenience method (`cache.get(...)`, `cache.getOrCreate(...)`,
`entry.setPriority(...)`, `options.setAbsoluteExpiration(...)`, and so on) is
also available as a plain function on the matching `*Extensions` object, in
case you're working with a bare object that hasn't had the methods installed
onto it, or you just prefer calling a function over a method.

## How it fits

`caching.core` depends only on
[`@rhombus-std/primitives`](../primitives/README.md) for change tokens and
platform typings (`AbortSignal`, `Token`) — it has no dependency on
dependency injection or configuration.

It's an abstractions package: nothing here actually stores a value.
[`@rhombus-std/caching.memory`](../caching.memory/README.md) is the concrete
in-memory implementation — a real `MemoryCache` with expiration,
size-limited compaction, eviction callbacks, and statistics, plus a
memory-backed `IDistributedCache`. Install it alongside `caching.core` to get
something that actually caches.

The `HybridCache`/`IHybridCacheSerializer` surface here is
**abstractions-only** — there's currently no concrete multi-tier
implementation in this family. Treat those exports as a stable contract to
build against or implement, not as something you can instantiate today.

## Notes

- `IDistributedCache` has no interface-side method merge: it's the one
  contract in this package meant to have many independent implementers
  (in-memory today, remote stores later), and merging convenience methods
  directly onto the interface would force every implementer and test fake to
  carry phantom members. Call `DistributedCacheExtensions.setString(cache, key, value)`
  and `DistributedCacheExtensions.getString(cache, key)` directly, or use the
  method form once your concrete class opts in.
- Durations are always plain numbers in **milliseconds**; absolute expirations
  are `Date` instances.
