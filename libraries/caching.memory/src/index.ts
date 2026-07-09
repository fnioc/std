// Public entry point for @rhombus-std/caching.memory -- the ME.Caching.Memory
// analog. Ships the real MemoryCache implementation, its `MemoryCacheOptions`
// bag (`MemoryCacheEntryOptions` now lives in caching.core, re-exported here),
// and -- as a side effect -- registers `addMemoryCache` against di.core's
// `ServiceManifest` augmentation token.
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
import type { AddBuilder, ServiceManifestClass } from "@rhombus-std/di.core";
import { SERVICE_MANIFEST_AUGMENTATION_TOKEN } from "@rhombus-std/di.core";
import { registerAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";
// Side-effect: installs the IMemoryCache/ICacheEntry convenience wrappers as
// instance methods onto MemoryCache/CacheEntry (the CLOSED-set path -- direct
// applyAugmentations, no token). Their standalone free-function form ships from
// caching.core's CacheExtensions/CacheEntryExtensions.
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
// static class (docs §28/§38), registered against the OPEN `ServiceManifest`
// augmentation token so the `@augment(SERVICE_MANIFEST_AUGMENTATION_TOKEN)`
// decoration in di.core pulls `addMemoryCache` onto the `ServiceManifestClass`
// prototype (the fluent path) AND exported so the member is the standalone form.
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

registerAugmentations(SERVICE_MANIFEST_AUGMENTATION_TOKEN, MemoryCacheServiceCollectionExtensions);

export { MemoryCache } from "./memory-cache";
// MemoryCacheEntryOptions now lives in caching.core (as ME has it in
// Abstractions); re-exported here for source compatibility.
export { MemoryCacheEntryOptions } from "@rhombus-std/caching.core";
export { MemoryCacheOptions } from "./memory-cache-options";
export { MEMORY_CACHE_TOKEN } from "./memory-cache-token";
export type { ISystemClock } from "./system-clock";
