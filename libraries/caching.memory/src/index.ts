// Public entry point for @rhombus-std/caching.memory -- the ME.Caching.Memory
// analog. Ships the real MemoryCache implementation, its options bags
// (MemoryCacheOptions / MemoryCacheEntryOptions), the options-consuming
// convenience wrappers, and -- as a side effect -- installs `addMemoryCache`
// onto @rhombus-std/di.core's registration builder.
//
// The augmentation mirrors @rhombus-std/config.json's addJsonFile /
// @rhombus-std/options.augmentations' addOptions: TS declaration merging plus a
// runtime prototype assignment onto ServiceManifestClass. A consumer who only
// wants the sugar takes a bare side-effect import:
// `import "@rhombus-std/caching.memory";`. This package MUST keep
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
import type { AddBuilder } from "@rhombus-std/di.core";
import { ServiceManifestClass } from "@rhombus-std/di.core";
import { applyAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";
// Side-effect: installs the IMemoryCache/ICacheEntry convenience wrappers as
// instance methods onto MemoryCache/CacheEntry -- the reverse-direction half of
// the dual-export convention. Their standalone free-function form ships from
// caching.core and ./entry-options-extensions.
import "./cache-augmentations";
import { MemoryCache } from "./memory-cache";
import { MemoryCacheOptions } from "./memory-cache-options";
import { MEMORY_CACHE_TOKEN } from "./memory-cache-token";

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
    addMemoryCache(setup?: (options: MemoryCacheOptions) => void): this;
  }

  interface ServiceManifestClass<Scopes extends string = "singleton"> {
    addMemoryCache(setup?: (options: MemoryCacheOptions) => void): this;
  }
}

// One named object literal mirroring the reference `MemoryCacheServiceCollectionExtensions`
// static class (docs §28), installed as a prototype method (the primary path)
// via applyAugmentations AND exported so the member is the standalone form.
export const MemoryCacheServiceCollectionExtensions = {
  addMemoryCache(
    manifest: ServiceManifestClass<string>,
    setup?: (options: MemoryCacheOptions) => void,
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
} satisfies AugmentationSet<ServiceManifestClass<string>>;

applyAugmentations(ServiceManifestClass, MemoryCacheServiceCollectionExtensions);

export { MemoryCacheEntryExtensions, MemoryCacheExtensions } from "./entry-options-extensions";
export { MemoryCache } from "./memory-cache";
export { MemoryCacheEntryOptions } from "./memory-cache-entry-options";
export { MemoryCacheOptions } from "./memory-cache-options";
export { MEMORY_CACHE_TOKEN } from "./memory-cache-token";
export type { ISystemClock } from "./system-clock";
