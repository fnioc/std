// Chained provider barrel + the addConfig augmentation.
//
// Like the Memory provider, Chained lives in the same package as
// ConfigBuilder, but its sugar method is installed via the SAME
// augmentation pattern the external provider packages use (TS declaration
// merging + a registry registration) -- ConfigBuilder itself carries no
// add* sugar of its own, only augmentations, even for the in-package Chained
// provider. `addConfig` targets the OPEN `IConfigBuilder`
// receiver, so it registers against tokenfor<IConfigBuilder>()
// (docs/decisions.md §38) rather than installing directly -- both concrete
// builders (ConfigBuilder and ConfigManager) are decorated with
// that token, so one registration reaches both.
//
// The ConfigBuilder augmentation targets the package barrel
// "@rhombus-std/config" (config-source routes it to ./src/index.ts for config's
// own compile -- see memory/index.ts). The receiver is generic over any builder
// whose add() returns itself, so ONE object literal satisfies `AugmentationSet`
// for both classes -- see memory/index.ts for the full rationale.

import type { ConfigBuilder } from '@rhombus-std/config';
import type { IConfig, IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives';
import { ChainedConfigSource } from './ChainedConfigSource';

export { ChainedConfigProvider } from './ChainedConfigProvider';
export { ChainedConfigSource } from './ChainedConfigSource';

// The generic arity + default MUST match the class declaration exactly, or
// declaration merging fails (TS2428). Every augmentation spells `<T =
// IndexedSection>` and imports the same `IndexedSection` from @rhombus-std/config.core.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> {
    /** Adds `config` as a chained configuration source. */
    addConfig(config: IConfig, shouldDisposeConfig?: boolean): this;
  }
}

// ConfigManager has no generic type parameter, so there's no TS2428
// arity concern here the way there is for ConfigBuilder<T>.
declare module '../ConfigManager' {
  interface ConfigManager {
    /** Adds `config` as a chained configuration source. */
    addConfig(config: IConfig, shouldDisposeConfig?: boolean): this;
  }
}

// One named object literal mirroring the reference `ChainedBuilderExtensions`
// static class (docs §28/§38), registered against the shared
// IConfigBuilder token AND exported so the member is the standalone
// form. `TBuilder` is bounded by "has an add() that returns itself" rather than
// pinned to ConfigBuilder<T> -- see memory/index.ts for the full rationale.
export const ChainedBuilderExtensions = {
  addConfig<TBuilder extends { add(source: IConfigSource): TBuilder; }>(
    builder: TBuilder,
    config: IConfig,
    shouldDisposeConfig = false,
  ): TBuilder {
    return builder.add(new ChainedConfigSource({ config, shouldDisposeConfig }));
  },
} satisfies AugmentationSet<ConfigBuilder<unknown>>;

registerAugmentations(tokenfor<IConfigBuilder>(), ChainedBuilderExtensions);
