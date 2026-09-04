// The memory-cache and distributed-memory-cache registrations, each published
// as a manifest a consumer merges into their own with `add`.
//
// `addOptions` registers the `IOptions<T>` assembly for the options type;
// `setup`, merged in through `getConfigureManifest`, becomes a LAZY code
// configure step (it runs when the options first resolve, not at
// registration); the cache factory then resolves the assembled options plus
// -- when logging is registered -- the `ILoggerFactory`, falling back to a
// logger-less construction when no logger factory is available. The configure
// step's own registrations carry no lifetime of their own, which is what keeps
// the manifest at `unknown` rather than the narrower `'singleton'` the cache
// registration itself uses.
//
// The cache registrations go through di.core's `tryAdd`, so an earlier
// registration for the same type is kept while `configure` steps still
// accumulate. (The options ASSEMBLY registration stays plain `addOptions`;
// re-registering the identical assembly is last-wins and observably
// equivalent.)

// Type-only: puts di.extras' declare-module sugar faces in the program with
// no runtime import of the authoring package.
import type {} from '@rhombus-std/di.extras';

import { type IServiceProvider, Manifest } from '@rhombus-std/di.core';
import type { ILoggerFactory } from '@rhombus-std/logging.core';
import type { IOptions } from '@rhombus-std/options';
import { getConfigureManifest } from '@rhombus-std/options.augmentations';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/types';
import { DISTRIBUTED_CACHE_TYPE } from './distributed-cache-type';
import { MEMORY_CACHE_OPTIONS_TYPE, MEMORY_DISTRIBUTED_CACHE_OPTIONS_TYPE } from './memory-cache-options-type';
import { MEMORY_CACHE_TYPE } from './memory-cache-type';
import { MemoryCache } from './MemoryCache';
import { MemoryCacheOptions } from './MemoryCacheOptions';
import { MemoryDistributedCache } from './MemoryDistributedCache';
import { MemoryDistributedCacheOptions } from './MemoryDistributedCacheOptions';

/**
 * The singleton {@link MemoryCache} registration, resolvable as `IMemoryCache`
 * at {@link MEMORY_CACHE_TYPE}, assembled from the `IOptions<MemoryCacheOptions>`
 * pipeline keyed at {@link MEMORY_CACHE_OPTIONS_TYPE} and -- when logging is
 * registered -- the `ILoggerFactory`. `setup` joins the options pipeline as a
 * configure step, so it runs LAZILY when the options first resolve.
 */
export function getMemoryCacheManifest(setup?: Func<[MemoryCacheOptions], void>): Manifest<unknown> {
  let m = Manifest.empty<unknown>().addOptions(MEMORY_CACHE_OPTIONS_TYPE, () => new MemoryCacheOptions());
  if (setup !== undefined) {
    // `setup` joins the options pipeline as a configure step: it runs
    // lazily, when the options first resolve, not at registration.
    m = m.add(getConfigureManifest(MEMORY_CACHE_OPTIONS_TYPE, setup));
  }
  // `tryAdd` only registers if the type is still free, keeping any
  // earlier registration. `resolve` returns `undefined` when no
  // `ILoggerFactory` is registered, so the factory falls to a logger-less
  // construction.
  return m.tryAdd(MEMORY_CACHE_TYPE,
    (resolver: IServiceProvider) => new MemoryCache(resolver.resolve<IOptions<MemoryCacheOptions>>(), resolver.resolve(Type.union(typefor<ILoggerFactory>(), Type.typeLiteral(undefined)))),
    Type.func(MEMORY_CACHE_TYPE, [[typefor<IServiceProvider>()]]), 'singleton');
}

/**
 * The singleton {@link MemoryDistributedCache} registration, resolvable as
 * `IDistributedCache` at {@link DISTRIBUTED_CACHE_TYPE} -- a default
 * in-memory implementation frameworks that require a distributed cache can
 * rely on. Single-server only: items live in this process's memory. `setup`
 * joins the `IOptions<MemoryDistributedCacheOptions>` pipeline (keyed at
 * {@link MEMORY_DISTRIBUTED_CACHE_OPTIONS_TYPE}) as a lazy configure step.
 */
export function getDistributedMemoryCacheManifest(setup?: Func<[MemoryDistributedCacheOptions], void>): Manifest<unknown> {
  // Same shape as getMemoryCacheManifest, over the distributed options type.
  // The cache is REGISTERED here but built lazily on first resolve, over its
  // own private MemoryCache.
  let m = Manifest.empty<unknown>().addOptions(MEMORY_DISTRIBUTED_CACHE_OPTIONS_TYPE, () => new MemoryDistributedCacheOptions());
  if (setup !== undefined) {
    m = m.add(getConfigureManifest(MEMORY_DISTRIBUTED_CACHE_OPTIONS_TYPE, setup));
  }
  return m.tryAdd(DISTRIBUTED_CACHE_TYPE, (resolver: IServiceProvider) =>
    new MemoryDistributedCache(
      resolver.resolve<IOptions<MemoryDistributedCacheOptions>>(),
      resolver.resolve(Type.union(typefor<ILoggerFactory>(), Type.typeLiteral(undefined))),
    ), Type.func(DISTRIBUTED_CACHE_TYPE, [[typefor<IServiceProvider>()]]), 'singleton');
}
