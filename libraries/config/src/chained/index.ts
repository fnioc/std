// Chained provider barrel + the addConfiguration augmentation.
//
// Like the Memory provider, Chained lives in the same package as
// ConfigurationBuilder, but its sugar method is installed via the SAME
// extension-method-mimicking pattern the external provider packages use (TS
// declaration merging + a runtime prototype assignment) -- ConfigurationBuilder
// itself carries no add* sugar of its own, only augmentations, even for the
// in-package Chained provider. The augmentation targets the module that
// DECLARES the class so the merge survives the re-export through the package
// barrel.
//
// Installed on BOTH ConfigurationBuilder and ConfigurationManager: the
// reference extension method targets IConfigurationBuilder, and
// ConfigurationManager implements that interface too, so
// `manager.addConfiguration(...)` works the same way `builder.addConfiguration(...)`
// does. The augmentation's receiver is generic over any receiver whose add()
// returns itself, rather than pinned to ConfigurationBuilder<T>, so ONE object
// literal satisfies `AugmentationSet` for both classes -- see memory/index.ts
// for the full rationale.

import type { IConfiguration, IConfigurationSource, IndexedSection } from "@rhombus-std/config.core";
import { applyAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";
import { ConfigurationBuilder } from "../configuration-builder";
import { ConfigurationManager } from "../configuration-manager";
import { ChainedConfigurationSource } from "./chained-configuration-source";

export { ChainedConfigurationProvider } from "./chained-configuration-provider";
export { ChainedConfigurationSource } from "./chained-configuration-source";

// The generic arity + default MUST match the class declaration exactly, or
// declaration merging fails (TS2428). Every augmentation spells `<T =
// IndexedSection>` and imports the same `IndexedSection` from @rhombus-std/config.core.
declare module "../configuration-builder" {
  interface ConfigurationBuilder<T = IndexedSection> {
    /** Adds `config` as a chained configuration source. */
    addConfiguration(config: IConfiguration, shouldDisposeConfiguration?: boolean): this;
  }
}

// ConfigurationManager has no generic type parameter, so there's no TS2428
// arity concern here the way there is for ConfigurationBuilder<T>.
declare module "../configuration-manager" {
  interface ConfigurationManager {
    /** Adds `config` as a chained configuration source. */
    addConfiguration(config: IConfiguration, shouldDisposeConfiguration?: boolean): this;
  }
}

// One named object literal mirroring the reference `ChainedBuilderExtensions`
// static class (docs §28), installed as a prototype method on BOTH classes AND
// exported so the member is the standalone form. `TBuilder` is bounded by
// "has an add() that returns itself" rather than pinned to
// ConfigurationBuilder<T> -- see memory/index.ts for the full rationale.
export const ChainedBuilderExtensions = {
  addConfiguration<TBuilder extends { add(source: IConfigurationSource): TBuilder }>(
    builder: TBuilder,
    config: IConfiguration,
    shouldDisposeConfiguration = false,
  ): TBuilder {
    return builder.add(new ChainedConfigurationSource({ configuration: config, shouldDisposeConfiguration }));
  },
} satisfies AugmentationSet<ConfigurationBuilder<unknown>>;

applyAugmentations(ConfigurationBuilder, ChainedBuilderExtensions);
applyAugmentations(ConfigurationManager, ChainedBuilderExtensions);
