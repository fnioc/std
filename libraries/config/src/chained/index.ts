// Chained provider barrel + the addConfig augmentation.
//
// `addConfig` targets the OPEN `IConfigBuilder` receiver, so it registers
// against tokenfor<IConfigBuilder>() rather than installing directly --
// both concrete builders (ConfigBuilder and ConfigManager) are decorated
// with that token, so one registration reaches both.

import type { ConfigBuilder } from '@rhombus-std/config';
import type { IConfig, IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
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

// Registered against the shared IConfigBuilder token AND exported, so the
// member is also usable directly as its standalone form. `TBuilder` is
// bounded by "has an add() that returns itself" rather than pinned to
// ConfigBuilder<T>, so ConfigManager satisfies it too.
export const ChainedBuilderExtensions = {
  addConfig<TBuilder extends { add(source: IConfigSource): TBuilder; }>(builder: TBuilder, config: IConfig,
    shouldDisposeConfig = false): TBuilder
  {
    return builder.add(new ChainedConfigSource({ config, shouldDisposeConfig }));
  },
} satisfies AugmentationSet<ConfigBuilder<unknown>>;

registerAugmentations(tokenfor<IConfigBuilder>(), ChainedBuilderExtensions);
