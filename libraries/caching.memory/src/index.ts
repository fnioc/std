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
// Divergences from the reference AddMemoryCache (noted in the README):
//   - No `TryAdd` in di.core, so this is a plain last-wins `addFactory`
//     (calling it twice re-registers; the reference keeps the first).
//   - No IOptions pipeline / ILoggerFactory injection wired here: `setup` is
//     applied EAGERLY at registration time and the cache is built with a null
//     logger. The full options-pipeline + logger-factory wiring is deferred.

// `MemoryCacheOptions` is a named import so its unqualified name resolves
// inside the `declare module` body below (see @rhombus-std/options.augmentations).
import type { AddBuilder, ServiceManifest, ServiceManifestClass } from "@rhombus-std/di.core";
import { type AugmentationSet, registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { Func } from "@rhombus-toolkit/func";
// Brings the class-side type merges for the IMemoryCache/ICacheEntry convenience
// wrappers into the program. The runtime install is the registry path (docs §38):
// caching.core registers CacheExtensions/CacheEntryExtensions against the
// `IMemoryCache`/`ICacheEntry` tokens, and the `@augment(nameof<…>())` decoration
// beside MemoryCache/CacheEntry pulls them onto the prototypes.
import "./cache-augmentations";
import { DISTRIBUTED_CACHE_TOKEN } from "./distributed-cache-token";
import { MEMORY_CACHE_TOKEN } from "./memory-cache-token";
import { MemoryCache } from "./MemoryCache";
import { MemoryCacheOptions } from "./MemoryCacheOptions";
import { MemoryDistributedCache } from "./MemoryDistributedCache";
import { MemoryDistributedCacheOptions } from "./MemoryDistributedCacheOptions";

// Merge `addMemoryCache` onto core's `ServiceManifestBase` interface (the
// surface a consumer holding `ServiceManifest<S>` resolves to) AND onto the
// concrete `ServiceManifestClass` (so the class still SATISFIES the interface
// once this new method name is on it). `Provider` is defaulted so each merge
// matches its target's type-parameter list (TS2428 requires identical params).
declare module "@rhombus-std/di.core" {
  interface ServiceManifestBase<Scopes extends string = "singleton", Provider = unknown> {
    /**
     * Registers a singleton {@link MemoryCache} as `IMemoryCache` (resolvable
     * at {@link MEMORY_CACHE_TOKEN}). `setup` configures the
     * {@link MemoryCacheOptions} eagerly at registration time. Returns the
     * manifest for chaining.
     */
    addMemoryCache(setup?: Func<[MemoryCacheOptions], void>): this;

    /**
     * Registers a singleton {@link MemoryDistributedCache} as
     * `IDistributedCache` (resolvable at {@link DISTRIBUTED_CACHE_TOKEN}) --
     * a default in-memory implementation frameworks that require a
     * distributed cache can rely on. Single-server only: items live in this
     * process's memory. `setup` configures the
     * {@link MemoryDistributedCacheOptions} eagerly at registration time.
     * Returns the manifest for chaining.
     */
    addDistributedMemoryCache(setup?: Func<[MemoryDistributedCacheOptions], void>): this;
  }

  interface ServiceManifestClass<Scopes extends string = "singleton"> {
    addMemoryCache(setup?: Func<[MemoryCacheOptions], void>): this;
    addDistributedMemoryCache(setup?: Func<[MemoryDistributedCacheOptions], void>): this;
  }
}

// One named object literal mirroring the reference `MemoryCacheServiceCollectionExtensions`
// static class (docs §28/§38), registered against the OPEN `ServiceManifest`
// augmentation token so the `@augment(nameof<ServiceManifest>())`
// decoration in di.core pulls `addMemoryCache` onto the `ServiceManifestClass`
// prototype (the fluent path) AND exported so the member is the standalone form.
export const MemoryCacheServiceCollectionExtensions = {
  addMemoryCache(
    manifest: ServiceManifestClass<string>,
    setup?: Func<[MemoryCacheOptions], void>,
  ): ServiceManifestClass<string> {
    const options = new MemoryCacheOptions();
    if (setup !== undefined) {
      setup(options);
    }
    // Eager build: the factory closes over the already-configured options and
    // takes no injected args. Registered `.as("singleton")` so the cache caches
    // once the singleton frame is open (the reference registers Singleton).
    const builder: AddBuilder<string> = manifest.addFactory(MEMORY_CACHE_TOKEN, () => new MemoryCache(options));
    builder.as("singleton");
    return manifest;
  },

  addDistributedMemoryCache(
    manifest: ServiceManifestClass<string>,
    setup?: Func<[MemoryDistributedCacheOptions], void>,
  ): ServiceManifestClass<string> {
    const options = new MemoryDistributedCacheOptions();
    if (setup !== undefined) {
      setup(options);
    }
    // Same shape as addMemoryCache: eager setup, `.as("singleton")` (the
    // reference registers Singleton). The cache is REGISTERED here but built
    // lazily on first resolve, over its own private MemoryCache.
    const builder: AddBuilder<string> = manifest.addFactory(
      DISTRIBUTED_CACHE_TOKEN,
      () => new MemoryDistributedCache(options),
    );
    builder.as("singleton");
    return manifest;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

registerAugmentations(nameof<ServiceManifest>(), MemoryCacheServiceCollectionExtensions);

export { MemoryCache } from "./MemoryCache";
// MemoryCacheEntryOptions now lives in caching.core (as ME has it in
// Abstractions); re-exported here for source compatibility.
export { MemoryCacheEntryOptions } from "@rhombus-std/caching.core";
export { DISTRIBUTED_CACHE_TOKEN } from "./distributed-cache-token";
export type { ISystemClock } from "./ISystemClock";
export { MEMORY_CACHE_TOKEN } from "./memory-cache-token";
export { MemoryCacheOptions } from "./MemoryCacheOptions";
export { MemoryDistributedCache } from "./MemoryDistributedCache";
export { MemoryDistributedCacheOptions } from "./MemoryDistributedCacheOptions";
