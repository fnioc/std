// Ships the real MemoryCache implementation, its `MemoryCacheOptions` bag
// (`MemoryCacheEntryOptions` lives in caching.core, re-exported here), the
// memory-backed MemoryDistributedCache (+ MemoryDistributedCacheOptions), and
// -- as a side effect -- registers `addMemoryCache` and
// `addDistributedMemoryCache` against di.core's `ServiceManifest`
// augmentation token.
//
// A consumer who only wants the sugar takes a bare side-effect import:
// `import "@rhombus-std/caching.memory";`. This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake the augmentation away.
//
// `addOptions` registers the `IOptions<T>` assembly for the options token;
// `setup` becomes a LAZY code configure step (it runs when the options first
// resolve, not at registration); the cache factory then resolves the
// assembled options plus -- when logging is registered -- the
// `ILoggerFactory`, falling back to a logger-less construction when no
// logger factory is available.
//
// The cache registrations go through di.core's `tryAddFactory`, so an
// earlier registration for the same token is kept while `configure` steps
// still accumulate. (The options ASSEMBLY registration stays plain
// `addOptions`; re-registering the identical assembly is last-wins and
// observably equivalent.)

// Installs the options-pipeline verbs (`addOptions`/`configure`) onto di.core's
// ServiceManifest and brings their interface merges into the program.
import '@rhombus-std/options.augmentations';

import type { IResolver, IServiceManifest, ServiceManifestClass } from '@rhombus-std/di.core';
import { RESOLVER_TOKEN } from '@rhombus-std/di.core';
import type { ILoggerFactory } from '@rhombus-std/logging.core';
import type { IOptions } from '@rhombus-std/options';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { DISTRIBUTED_CACHE_TOKEN } from './distributed-cache-token';
import { MEMORY_CACHE_OPTIONS_TOKEN, MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN } from './memory-cache-options-token';
import { MEMORY_CACHE_TOKEN } from './memory-cache-token';
import { MemoryCache } from './MemoryCache';
// `MemoryCacheOptions` is a named import so its unqualified name resolves
// inside the `declare module` body below.
import { MemoryCacheOptions } from './MemoryCacheOptions';
import { MemoryDistributedCache } from './MemoryDistributedCache';
import { MemoryDistributedCacheOptions } from './MemoryDistributedCacheOptions';

// The token `@rhombus-std/logging`'s `addLogging` binds `ILoggerFactory` at --
// derived here via `tokenfor<ILoggerFactory>()` rather than importing
// logging's const, so the dependency on `ILoggerFactory` stays type-only and
// this package never drags in logging's side-effect registrations. Deriving
// off the same type keeps the token byte-identical to logging's own, so the
// two never desync.
const LOGGER_FACTORY_TOKEN = tokenfor<ILoggerFactory>();

// Merge `addMemoryCache` onto core's `IServiceManifestBase` interface (the
// surface a consumer holding `ServiceManifest<S>` resolves to) AND onto the
// concrete `ServiceManifestClass` (so the class still SATISFIES the interface
// once this new method name is on it). `Provider` is defaulted so each merge
// matches its target's type-parameter list (TS2428 requires identical params).
declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
    /**
     * Registers a singleton {@link MemoryCache} as `IMemoryCache` (resolvable
     * at {@link MEMORY_CACHE_TOKEN}), assembled from the
     * `IOptions<MemoryCacheOptions>` pipeline keyed at
     * {@link MEMORY_CACHE_OPTIONS_TOKEN} and -- when logging is registered --
     * the `ILoggerFactory`. `setup` joins the options pipeline as a configure
     * step, so it runs LAZILY when the options first resolve. Returns the
     * manifest for chaining.
     */
    addMemoryCache(setup?: Func<[MemoryCacheOptions], void>): IServiceManifest<Scopes>;

    /**
     * Registers a singleton {@link MemoryDistributedCache} as
     * `IDistributedCache` (resolvable at {@link DISTRIBUTED_CACHE_TOKEN}) --
     * a default in-memory implementation frameworks that require a
     * distributed cache can rely on. Single-server only: items live in this
     * process's memory. `setup` joins the
     * `IOptions<MemoryDistributedCacheOptions>` pipeline (keyed at
     * {@link MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN}) as a lazy configure
     * step. Returns the manifest for chaining.
     */
    addDistributedMemoryCache(setup?: Func<[MemoryDistributedCacheOptions], void>): IServiceManifest<Scopes>;
  }

  interface ServiceManifestClass<Scopes extends string = 'singleton'> {
    addMemoryCache(setup?: Func<[MemoryCacheOptions], void>): IServiceManifest<Scopes>;
    addDistributedMemoryCache(setup?: Func<[MemoryDistributedCacheOptions], void>): IServiceManifest<Scopes>;
  }
}

// Registered against the OPEN `ServiceManifest` augmentation token, so the
// `@augment(tokenfor<IServiceManifest>())` decoration in di.core pulls
// `addMemoryCache` onto `ServiceManifestClass`'s prototype (the fluent path);
// also exported so the same implementation works as a standalone call.
export const MemoryCacheServiceManifestAugmentations = {
  addMemoryCache(manifest: ServiceManifestClass<string>,
    setup?: Func<[MemoryCacheOptions], void>): IServiceManifest<string> {
    let m: IServiceManifest<string> = manifest.addOptions(MEMORY_CACHE_OPTIONS_TOKEN, () => new MemoryCacheOptions())
      .as('singleton');
    if (setup !== undefined) {
      // `setup` joins the options pipeline as a configure step: it runs
      // lazily, when the options first resolve, not at registration.
      m = m.configure(MEMORY_CACHE_OPTIONS_TOKEN, setup);
    }
    // `tryAddFactory` only registers if the token is still free, keeping any
    // earlier registration. `tryResolve` returns `undefined` when no
    // `ILoggerFactory` is registered, so the factory falls to a logger-less
    // construction.
    // The cast works around a TS structural-comparison depth limit: the
    // `IServiceManifestBase`/`IServiceManifest` overload surface (di.core's
    // ServiceManifestDescriptorAugmentations merge) is large enough that TS's
    // relationship check bails out on this self-assignment even though the two
    // sides are the same type (see diagnostics.core's
    // `clearMetricsListeners` for the full explanation).
    m = m.tryAddFactory(MEMORY_CACHE_TOKEN,
      (resolver: IResolver) =>
        new MemoryCache(resolver.resolve<IOptions<MemoryCacheOptions>>(MEMORY_CACHE_OPTIONS_TOKEN),
          resolver.tryResolve<ILoggerFactory>(LOGGER_FACTORY_TOKEN)), [[RESOLVER_TOKEN]],
      'singleton') as IServiceManifest<string>;
    return m;
  },

  addDistributedMemoryCache(manifest: ServiceManifestClass<string>,
    setup?: Func<[MemoryDistributedCacheOptions], void>): IServiceManifest<string> {
    // Same shape as addMemoryCache, over the distributed options token. The
    // cache is REGISTERED here but built lazily on first resolve, over its
    // own private MemoryCache.
    let m: IServiceManifest<string> = manifest.addOptions(MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN,
      () => new MemoryDistributedCacheOptions()).as('singleton');
    if (setup !== undefined) {
      m = m.configure(MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN, setup);
    }
    // See addMemoryCache's cast above for why this is needed.
    m = m.tryAddFactory(DISTRIBUTED_CACHE_TOKEN, (resolver: IResolver) =>
      new MemoryDistributedCache(
        resolver.resolve<IOptions<MemoryDistributedCacheOptions>>(MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN),
        resolver.tryResolve<ILoggerFactory>(LOGGER_FACTORY_TOKEN),
      ), [[RESOLVER_TOKEN]], 'singleton') as IServiceManifest<string>;
    return m;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

registerAugmentations(tokenfor<IServiceManifest>(), MemoryCacheServiceManifestAugmentations);

export { MemoryCache } from './MemoryCache';
// Re-exported for source compatibility; the type itself lives in caching.core.
export { MemoryCacheEntryOptions } from '@rhombus-std/caching.core';
export { DISTRIBUTED_CACHE_TOKEN } from './distributed-cache-token';
export type { ISystemClock } from './ISystemClock';
export { MEMORY_CACHE_OPTIONS_TOKEN, MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN } from './memory-cache-options-token';
export { MEMORY_CACHE_TOKEN } from './memory-cache-token';
export { MemoryCacheOptions } from './MemoryCacheOptions';
export { MemoryDistributedCache } from './MemoryDistributedCache';
export { MemoryDistributedCacheOptions } from './MemoryDistributedCacheOptions';
