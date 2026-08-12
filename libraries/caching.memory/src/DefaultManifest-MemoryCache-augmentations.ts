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
import type { IOptions } from '@rhombus-std/options';
import { type AugmentationSet2, registerAugmentations, Type } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { DISTRIBUTED_CACHE_TOKEN } from './distributed-cache-token';
import { MEMORY_CACHE_OPTIONS_TOKEN, MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN } from './memory-cache-options-token';
import { MEMORY_CACHE_TOKEN } from './memory-cache-token';
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
const LOGGER_FACTORY_TOKEN = tokenfor<ILoggerFactory>();

type IServiceManifestMemoryCacheAugmentations<Scopes extends string> = {
  /**
   * Registers a singleton {@link MemoryCache} as `IMemoryCache` (resolvable
   * at {@link MEMORY_CACHE_TOKEN}), assembled from the
   * `IOptions<MemoryCacheOptions>` pipeline keyed at
   * {@link MEMORY_CACHE_OPTIONS_TOKEN} and -- when logging is registered --
   * the `ILoggerFactory`. `setup` joins the options pipeline as a configure
   * step, so it runs LAZILY when the options first resolve. Returns the
   * manifest for chaining.
   */
  addMemoryCache(setup?: Func<[MemoryCacheOptions], void>): Manifest<Scopes>;

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
  addDistributedMemoryCache(setup?: Func<[MemoryDistributedCacheOptions], void>): Manifest<Scopes>;
};

// `Provider` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters), even though the members do not name it.
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string = any> extends IServiceManifestMemoryCacheAugmentations<Scopes> {}
}

export const ServiceManifestMemoryCacheAugmentations: AugmentationSet2<DefaultManifest<string>,
  IServiceManifestMemoryCacheAugmentations<string>> = {
    addMemoryCache(manifest, setup) {
      let m: Manifest<string> = manifest.addOptions(MEMORY_CACHE_OPTIONS_TOKEN, () => new MemoryCacheOptions());
      if (setup !== undefined) {
        // `setup` joins the options pipeline as a configure step: it runs
        // lazily, when the options first resolve, not at registration.
        m = m.configure(MEMORY_CACHE_OPTIONS_TOKEN, setup);
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
      m = m.tryAddFactory(MEMORY_CACHE_TOKEN,
        (resolver: IServiceProvider) =>
          new MemoryCache(resolver.getRequiredService(Type.from(MEMORY_CACHE_OPTIONS_TOKEN)),
            resolver.getService(Type.from(LOGGER_FACTORY_TOKEN))), [[RESOLVER_TYPE]], 'singleton') as Manifest<
          string
        >;
      return m;
    },

    addDistributedMemoryCache(manifest, setup) {
      // Same shape as addMemoryCache, over the distributed options token. The
      // cache is REGISTERED here but built lazily on first resolve, over its
      // own private MemoryCache.
      let m: Manifest<string> = manifest.addOptions(MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN,
        () => new MemoryDistributedCacheOptions());
      if (setup !== undefined) {
        m = m.configure(MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN, setup);
      }
      // See addMemoryCache's cast above for why this is needed.
      m = m.tryAddFactory(DISTRIBUTED_CACHE_TOKEN, (resolver: IServiceProvider) =>
        new MemoryDistributedCache(
          resolver.getRequiredService(Type.from(MEMORY_DISTRIBUTED_CACHE_OPTIONS_TOKEN)),
          resolver.getService(Type.from(LOGGER_FACTORY_TOKEN)),
        ), [[RESOLVER_TYPE]], 'singleton') as Manifest<string>;
      return m;
    },
  };

registerAugmentations(tokenfor<Manifest>(), ServiceManifestMemoryCacheAugmentations);
