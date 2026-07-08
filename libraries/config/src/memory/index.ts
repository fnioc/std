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

import type { IndexedSection } from "@rhombus-std/config.core";
import { applyAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";
import { ConfigurationBuilder } from "../configuration-builder";
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

// One named object literal mirroring the reference `MemoryConfigurationBuilderExtensions`
// static class (docs §28), installed as a prototype method AND exported so the
// member is the standalone form.
export const MemoryConfigurationBuilderExtensions = {
  addInMemoryCollection<T>(builder: ConfigurationBuilder<T>, initialData?: ConfigurationData): ConfigurationBuilder<T> {
    return builder.add(new MemoryConfigurationSource({ initialData }));
  },
} satisfies AugmentationSet<ConfigurationBuilder<unknown>>;

applyAugmentations(ConfigurationBuilder, MemoryConfigurationBuilderExtensions);
