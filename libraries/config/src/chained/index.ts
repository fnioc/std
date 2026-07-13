// Chained provider barrel + the addConfiguration augmentation.
//
// Like the Memory provider, Chained lives in the same package as
// ConfigurationBuilder, but its sugar method is installed via the SAME
// augmentation pattern the external provider packages use (TS declaration
// merging + a registry registration) -- ConfigurationBuilder itself carries no
// add* sugar of its own, only augmentations, even for the in-package Chained
// provider. `addConfiguration` targets the OPEN `IConfigurationBuilder`
// receiver, so it registers against nameof<IConfigurationBuilder>()
// (docs/decisions.md §38) rather than installing directly -- both concrete
// builders (ConfigurationBuilder and ConfigurationManager) are decorated with
// that token, so one registration reaches both.
//
// The ConfigurationBuilder augmentation targets the package barrel
// "@rhombus-std/config" (config-source routes it to ./src/index.ts for config's
// own compile -- see memory/index.ts). The receiver is generic over any builder
// whose add() returns itself, so ONE object literal satisfies `AugmentationSet`
// for both classes -- see memory/index.ts for the full rationale.

import type { ConfigurationBuilder } from '@rhombus-std/config';
import type { IConfiguration, IConfigurationBuilder, IConfigurationSource,
  IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import { ChainedConfigurationSource } from './ChainedConfigurationSource';

export { ChainedConfigurationProvider } from './ChainedConfigurationProvider';
export { ChainedConfigurationSource } from './ChainedConfigurationSource';

// The generic arity + default MUST match the class declaration exactly, or
// declaration merging fails (TS2428). Every augmentation spells `<T =
// IndexedSection>` and imports the same `IndexedSection` from @rhombus-std/config.core.
declare module '@rhombus-std/config' {
  interface ConfigurationBuilder<T = IndexedSection> {
    /** Adds `config` as a chained configuration source. */
    addConfiguration(config: IConfiguration, shouldDisposeConfiguration?: boolean): this;
  }
}

// ConfigurationManager has no generic type parameter, so there's no TS2428
// arity concern here the way there is for ConfigurationBuilder<T>.
declare module '../ConfigurationManager' {
  interface ConfigurationManager {
    /** Adds `config` as a chained configuration source. */
    addConfiguration(config: IConfiguration, shouldDisposeConfiguration?: boolean): this;
  }
}

// One named object literal mirroring the reference `ChainedBuilderExtensions`
// static class (docs §28/§38), registered against the shared
// IConfigurationBuilder token AND exported so the member is the standalone
// form. `TBuilder` is bounded by "has an add() that returns itself" rather than
// pinned to ConfigurationBuilder<T> -- see memory/index.ts for the full rationale.
export const ChainedBuilderExtensions = {
  addConfiguration<TBuilder extends { add(source: IConfigurationSource): TBuilder; }>(
    builder: TBuilder,
    config: IConfiguration,
    shouldDisposeConfiguration = false,
  ): TBuilder {
    return builder.add(new ChainedConfigurationSource({ configuration: config, shouldDisposeConfiguration }));
  },
} satisfies AugmentationSet<ConfigurationBuilder<unknown>>;

registerAugmentations(nameof<IConfigurationBuilder>(), ChainedBuilderExtensions);
