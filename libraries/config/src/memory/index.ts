// Memory provider barrel + the addInMemoryCollection augmentation.
//
// Even though the Memory provider lives in the same package as
// ConfigurationBuilder, its sugar method is installed via the SAME
// extension-method-mimicking pattern the external provider packages use (TS
// declaration merging + a runtime prototype assignment) -- `ConfigurationBuilder`
// itself carries no add* sugar of its own, only augmentations, even for the
// in-package Memory provider. The augmentation targets the module that
// DECLARES the class so the merge survives the re-export through the package
// barrel.
//
// Installed on BOTH ConfigurationBuilder and ConfigurationManager: the
// reference extension method targets IConfigurationBuilder, and
// ConfigurationManager implements that interface too, so
// `manager.addInMemoryCollection(...)` works the same way
// `builder.addInMemoryCollection(...)` does. The augmentation's receiver is
// generic over any receiver whose `add()` returns itself, rather than pinned
// to ConfigurationBuilder<T>, so ONE object literal satisfies
// `AugmentationSet` for both classes while still preserving each one's own
// concrete return type through the fluent chain (ConfigurationBuilder<T>
// keeps T; ConfigurationManager stays ConfigurationManager).

import type { IConfigurationSource, IndexedSection } from "@rhombus-std/config.core";
import { applyAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";
import { ConfigurationBuilder } from "../configuration-builder";
import { ConfigurationManager } from "../configuration-manager";
import { type ConfigurationData, MemoryConfigurationSource } from "./memory-configuration-source";

export { MemoryConfigurationProvider } from "./memory-configuration-provider";
export { type ConfigurationData, MemoryConfigurationSource } from "./memory-configuration-source";

// The generic arity + default MUST match the class declaration exactly, or
// declaration merging fails (TS2428). Every augmentation spells `<T =
// IndexedSection>` and imports the same `IndexedSection` from @rhombus-std/config.core.
declare module "../configuration-builder" {
  interface ConfigurationBuilder<T = IndexedSection> {
    /** Registers an in-memory configuration source seeded with `initialData`. */
    addInMemoryCollection(initialData?: ConfigurationData): this;
  }
}

// ConfigurationManager has no generic type parameter, so there's no TS2428
// arity concern here the way there is for ConfigurationBuilder<T>.
declare module "../configuration-manager" {
  interface ConfigurationManager {
    /** Registers an in-memory configuration source seeded with `initialData`. */
    addInMemoryCollection(initialData?: ConfigurationData): this;
  }
}

// One named object literal mirroring the reference `MemoryConfigurationBuilderExtensions`
// static class (docs §28), installed as a prototype method on BOTH classes AND
// exported so the member is the standalone form. `TBuilder` is bounded by
// "has an add() that returns itself" rather than pinned to
// ConfigurationBuilder<T> -- see the module doc comment above.
export const MemoryConfigurationBuilderExtensions = {
  addInMemoryCollection<TBuilder extends { add(source: IConfigurationSource): TBuilder }>(
    builder: TBuilder,
    initialData?: ConfigurationData,
  ): TBuilder {
    return builder.add(new MemoryConfigurationSource({ initialData }));
  },
} satisfies AugmentationSet<ConfigurationBuilder<unknown>>;

applyAugmentations(ConfigurationBuilder, MemoryConfigurationBuilderExtensions);
applyAugmentations(ConfigurationManager, MemoryConfigurationBuilderExtensions);
