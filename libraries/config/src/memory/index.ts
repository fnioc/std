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
import { applyExtensions, defineExtensions } from "@rhombus-std/primitives";
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

// Dual-export (docs §22): a receiver-first function installed as a prototype
// method AND exported standalone.
export const inMemoryConfigExtensions = defineExtensions<ConfigurationBuilder>()({
  addInMemoryCollection(builder: ConfigurationBuilder, initialData?: ConfigurationData): ConfigurationBuilder {
    return builder.add(new MemoryConfigurationSource({ initialData }));
  },
});

applyExtensions(ConfigurationBuilder, inMemoryConfigExtensions);
