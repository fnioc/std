// Public entry point for @rhombus-std/caching.memory -- the ME.Caching.Memory
// analog. Ships the real MemoryCache implementation, its `MemoryCacheOptions`
// bag (`MemoryCacheEntryOptions` now lives in caching.core, re-exported here),
// the memory-backed MemoryDistributedCache (+ MemoryDistributedCacheOptions),
// and -- as a side effect -- registers `addMemoryCache` and
// `addDistributedMemoryCache` against di.core's `ServiceManifest`
// augmentation token.
//
// The augmentation mirrors @rhombus-std/config.json's addJsonFile /
// @rhombus-std/options.augmentations' addOptions: TS declaration merging plus a
// `registerAugmentations` call against the OPEN `ServiceManifest` token (docs
// §38), which the `@augment` decoration on `ServiceManifestClass` pulls onto
// the prototype. A consumer who only wants the sugar takes a bare side-effect
// import: `import "@rhombus-std/caching.memory";`. This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake the augmentation away.
//
// Both registrations mirror the reference's `AddOptions()` + `Configure(setup)`
// + singleton-service composition through the repo's options-assembly pipeline
// (the LOGGER_FILTER_OPTIONS_TOKEN precedent): `addOptions` registers the
// `IOptions<T>` assembly for the options token, `setup` becomes a LAZY code
// configure step (it runs when the options first resolve, not at registration),
// and the cache factory resolves the assembled options plus -- when logging is
// registered -- the `ILoggerFactory`, mirroring the reference's
// constructor-selection fallback to the logger-less constructor when no logger
// factory is available.
//
// The cache registrations go through di.core's `tryAddFactory` -- the
// reference `TryAdd(Singleton<...>)` analog -- so an earlier registration for
// the same token is kept while `Configure` steps still accumulate, exactly as
// the reference composes. (The options ASSEMBLY registration stays plain
// `addOptions`; re-registering the identical assembly is last-wins and
// observably equivalent.)

// Installs the options-pipeline verbs (`addOptions`/`configure`) onto di.core's
// ServiceManifest and brings their interface merges into the program.
import '@rhombus-std/options.augmentations';

// `MemoryCacheOptions` is a named import so its unqualified name resolves
// inside the `declare module` body below (see @rhombus-std/options.augmentations).
import type { IResolver, IServiceManifest, ServiceManifestClass } from '@rhombus-std/di.core';
import { RESOLVER_TOKEN } from '@rhombus-std/di.core';
import type { ILoggerFactory } from '@rhombus-std/logging.core';
import type { IOptions } from '@rhombus-std/options';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
// The runtime install is the registry path (docs §38): caching.core registers
// CacheExtensions/CacheEntryExtensions against the `IMemoryCache`/`ICacheEntry`
// tokens, and the `@augment(nameof<…>())` decoration beside MemoryCache/CacheEntry
// pulls them onto the prototypes. Each concrete class satisfies its interface via
// its own `interface ... extends I` merge beside the class -- no class-side module.
import { DISTRIBUTED_CACHE_TOKEN } from './distributed-cache-token';
import { MEMORY_CACHE_OPTIONS_TOKEN, MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN } from './memory-cache-options-token';
import { MEMORY_CACHE_TOKEN } from './memory-cache-token';
import { MemoryCache } from './MemoryCache';
import { MemoryCacheOptions } from './MemoryCacheOptions';
import { MemoryDistributedCache } from './MemoryDistributedCache';
import { MemoryDistributedCacheOptions } from './MemoryDistributedCacheOptions';

// The registration token @rhombus-std/logging's `addLogging` binds the
// `ILoggerFactory` singleton at -- derived here via `nameof<ILoggerFactory>()`
// rather than importing logging's const: importing the runtime const would add
// a dependency on the concrete logging package, an edge the reference graph
// doesn't have (ME.Caching.Memory references Logging.Abstractions only) and one
// whose barrel import would drag logging's side-effect registrations into every
// caching consumer. Deriving off the type-only `ILoggerFactory` import keeps
// the edge type-only AND stays byte-identical to logging's own
// `nameof<ILoggerFactory>()` token, so the two never desync.
const LOGGER_FACTORY_TOKEN = nameof<ILoggerFactory>();

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

// One named object literal mirroring the reference `MemoryCacheServiceCollectionExtensions`
// static class (docs §28/§38), registered against the OPEN `ServiceManifest`
// augmentation token so the `@augment(nameof<IServiceManifest>())`
// decoration in di.core pulls `addMemoryCache` onto the `ServiceManifestClass`
// prototype (the fluent path) AND exported so the member is the standalone form.
export const MemoryCacheServiceCollectionExtensions = {
  addMemoryCache(
    manifest: ServiceManifestClass<string>,
    setup?: Func<[MemoryCacheOptions], void>,
  ): IServiceManifest<string> {
    // The reference `AddOptions()` analog: register the IOptions<T> assembly
    // for the options token (§14/§15). Singleton, like every registration the
    // reference makes here.
    let m: IServiceManifest<string> = manifest
      .addOptions(MEMORY_CACHE_OPTIONS_TOKEN, () => new MemoryCacheOptions())
      .as('singleton');
    if (setup !== undefined) {
      // The reference `Configure(setupAction)` analog: a LAZY code configure
      // step run by the assembly when the options resolve.
      m = m.configure(MEMORY_CACHE_OPTIONS_TOKEN, setup);
    }
    // The reference `TryAdd(Singleton<IMemoryCache, MemoryCache>())`: register
    // only when the token is still free, keeping any earlier registration. The
    // factory resolves `MemoryCache(IOptions<MemoryCacheOptions>,
    // ILoggerFactory)`; when no logger factory is registered its constructor
    // selection falls back to the logger-less constructor -- `tryResolve`
    // reproduces exactly that.
    // The cast works around a TS structural-comparison depth limit: the
    // `IServiceManifestBase`/`IServiceManifest` overload surface (di.core's
    // ServiceCollectionDescriptorExtensions merge) is large enough that TS's
    // relationship check bails out on this self-assignment even though the two
    // sides are the same type (see diagnostics.core's
    // `clearMetricsListeners` for the full explanation).
    m = m.tryAddFactory(
      MEMORY_CACHE_TOKEN,
      (resolver: IResolver) =>
        new MemoryCache(
          resolver.resolve<IOptions<MemoryCacheOptions>>(MEMORY_CACHE_OPTIONS_TOKEN),
          resolver.tryResolve<ILoggerFactory>(LOGGER_FACTORY_TOKEN),
        ),
      [[RESOLVER_TOKEN]],
      'singleton',
    ) as IServiceManifest<string>;
    return m;
  },

  addDistributedMemoryCache(
    manifest: ServiceManifestClass<string>,
    setup?: Func<[MemoryDistributedCacheOptions], void>,
  ): IServiceManifest<string> {
    // Same shape as addMemoryCache, over the distributed options token. The
    // cache is REGISTERED here but built lazily on first resolve, over its
    // own private MemoryCache.
    let m: IServiceManifest<string> = manifest
      .addOptions(MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN, () => new MemoryDistributedCacheOptions())
      .as('singleton');
    if (setup !== undefined) {
      m = m.configure(MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN, setup);
    }
    // See addMemoryCache's cast above for why this is needed.
    m = m.tryAddFactory(
      DISTRIBUTED_CACHE_TOKEN,
      (resolver: IResolver) =>
        new MemoryDistributedCache(
          resolver.resolve<IOptions<MemoryDistributedCacheOptions>>(MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN),
          resolver.tryResolve<ILoggerFactory>(LOGGER_FACTORY_TOKEN),
        ),
      [[RESOLVER_TOKEN]],
      'singleton',
    ) as IServiceManifest<string>;
    return m;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

registerAugmentations(nameof<IServiceManifest>(), MemoryCacheServiceCollectionExtensions);

export { MemoryCache } from './MemoryCache';
// MemoryCacheEntryOptions now lives in caching.core (as ME has it in
// Abstractions); re-exported here for source compatibility.
export { MemoryCacheEntryOptions } from '@rhombus-std/caching.core';
export { DISTRIBUTED_CACHE_TOKEN } from './distributed-cache-token';
export type { ISystemClock } from './ISystemClock';
export { MEMORY_CACHE_OPTIONS_TOKEN, MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN } from './memory-cache-options-token';
export { MEMORY_CACHE_TOKEN } from './memory-cache-token';
export { MemoryCacheOptions } from './MemoryCacheOptions';
export { MemoryDistributedCache } from './MemoryDistributedCache';
export { MemoryDistributedCacheOptions } from './MemoryDistributedCacheOptions';
