// `addMemoryCache` / `addDistributedMemoryCache` on di.core's registration
// builder.
//
// `addOptions` registers the `IOptions<T>` assembly for the options token;
// `setup` becomes a LAZY code configure step (it runs when the options first
// resolve, not at registration); the cache factory then resolves the assembled
// options plus -- when logging is registered -- the `ILoggerFactory`, falling
// back to a logger-less construction when no logger factory is available.
//
// The cache registrations go through di.core's `tryAddFactory`, so an earlier
// registration for the same token is kept while `configure` steps still
// accumulate. (The options ASSEMBLY registration stays plain `addOptions`;
// re-registering the identical assembly is last-wins and observably
// equivalent.)

// Installs the options-pipeline verbs (`addOptions`/`configure`) onto di.core's
// Manifest and brings their interface merges into the program.
import '@rhombus-std/options.augmentations';

import type { DefaultManifest, IServiceProvider, Manifest } from '@rhombus-std/di.core';
import { RESOLVER_TYPE } from '@rhombus-std/di.core';
import type { ILoggerFactory } from '@rhombus-std/logging.core';
import { type AugmentationSet2, registerAugmentations } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { DISTRIBUTED_CACHE_TYPE } from './distributed-cache-type';
import { MEMORY_CACHE_OPTIONS_TYPE, MEMORY_DISTRIBUTED_CACHE_OPTIONS_TYPE } from './memory-cache-options-type';
import { MEMORY_CACHE_TYPE } from './memory-cache-type';
import { MemoryCache } from './MemoryCache';
import { MemoryCacheOptions } from './MemoryCacheOptions';
import { MemoryDistributedCache } from './MemoryDistributedCache';
import { MemoryDistributedCacheOptions } from './MemoryDistributedCacheOptions';

// The token `@rhombus-std/logging`'s `addLogging` binds `ILoggerFactory` at --
// derived here via `typefor<ILoggerFactory>()` rather than importing
// logging's const, so the dependency on `ILoggerFactory` stays type-only and
// this package never drags in logging's side-effect registrations. Deriving
// off the same type keeps the token byte-identical to logging's own, so the
// two never desync.
const LOGGER_FACTORY_TYPE = typefor<ILoggerFactory>();

type IManifestMemoryCacheAugmentations<Scopes extends string> = {
  /**
   * Registers a singleton {@link MemoryCache} as `IMemoryCache` (resolvable
   * at {@link MEMORY_CACHE_TYPE}), assembled from the
   * `IOptions<MemoryCacheOptions>` pipeline keyed at
   * {@link MEMORY_CACHE_OPTIONS_TYPE} and -- when logging is registered --
   * the `ILoggerFactory`. `setup` joins the options pipeline as a configure
   * step, so it runs LAZILY when the options first resolve. Returns the
   * manifest for chaining.
   */
  addMemoryCache(setup?: Func<[MemoryCacheOptions], void>): Manifest<Scopes>;

  /**
   * Registers a singleton {@link MemoryDistributedCache} as
   * `IDistributedCache` (resolvable at {@link DISTRIBUTED_CACHE_TYPE}) --
   * a default in-memory implementation frameworks that require a
   * distributed cache can rely on. Single-server only: items live in this
   * process's memory. `setup` joins the
   * `IOptions<MemoryDistributedCacheOptions>` pipeline (keyed at
   * {@link MEMORY_DISTRIBUTED_CACHE_OPTIONS_TYPE}) as a lazy configure
   * step. Returns the manifest for chaining.
   */
  addDistributedMemoryCache(setup?: Func<[MemoryDistributedCacheOptions], void>): Manifest<Scopes>;
};

// `Provider` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters), even though the members do not name it.
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string = any> extends IManifestMemoryCacheAugmentations<Scopes> {}
}

export const ServiceManifestMemoryCacheAugmentations: AugmentationSet2<DefaultManifest<string>,
  IManifestMemoryCacheAugmentations<string>> = {
    addMemoryCache(manifest, setup) {
      let m: Manifest<string> = manifest.addOptions(MEMORY_CACHE_OPTIONS_TYPE, () => new MemoryCacheOptions());
      if (setup !== undefined) {
        // `setup` joins the options pipeline as a configure step: it runs
        // lazily, when the options first resolve, not at registration.
        m = m.configure(MEMORY_CACHE_OPTIONS_TYPE, setup);
      }
      // `tryAddFactory` only registers if the token is still free, keeping any
      // earlier registration. `getService` returns `undefined` when no
      // `ILoggerFactory` is registered, so the factory falls to a logger-less
      // construction.
      // The cast works around a TS structural-comparison depth limit: the
      // `Manifest` overload surface (di.core's descriptor augmentation merge) is
      // large enough that TS's
      // relationship check bails out on this self-assignment even though the two
      // sides are the same type (see diagnostics.core's
      // `clearMetricsListeners` for the full explanation).
      m = m.tryAddFactory(MEMORY_CACHE_TYPE,
        (resolver: IServiceProvider) =>
          new MemoryCache(resolver.getRequiredService(MEMORY_CACHE_OPTIONS_TYPE),
            resolver.getService(LOGGER_FACTORY_TYPE)), [[RESOLVER_TYPE]], 'singleton') as Manifest<
          string
        >;
      return m;
    },

    addDistributedMemoryCache(manifest, setup) {
      // Same shape as addMemoryCache, over the distributed options token. The
      // cache is REGISTERED here but built lazily on first resolve, over its
      // own private MemoryCache.
      let m: Manifest<string> = manifest.addOptions(MEMORY_DISTRIBUTED_CACHE_OPTIONS_TYPE,
        () => new MemoryDistributedCacheOptions());
      if (setup !== undefined) {
        m = m.configure(MEMORY_DISTRIBUTED_CACHE_OPTIONS_TYPE, setup);
      }
      // See addMemoryCache's cast above for why this is needed.
      m = m.tryAddFactory(DISTRIBUTED_CACHE_TYPE, (resolver: IServiceProvider) =>
        new MemoryDistributedCache(
          resolver.getRequiredService(MEMORY_DISTRIBUTED_CACHE_OPTIONS_TYPE),
          resolver.getService(LOGGER_FACTORY_TYPE),
        ), [[RESOLVER_TYPE]], 'singleton') as Manifest<string>;
      return m;
    },
  };

registerAugmentations(typefor<Manifest>(), ServiceManifestMemoryCacheAugmentations);
