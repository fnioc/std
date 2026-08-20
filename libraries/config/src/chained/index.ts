// Chained provider barrel + the addConfig augmentation.

import type { IConfig, IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/type-helpers';
import { ChainedConfigSource } from './ChainedConfigSource';

export * from './ChainedConfigProvider';
export * from './ChainedConfigSource';

/** The subset of {@link IConfigBuilder} and `config`'s `ConfigBuilder<T>` this sugar's `add` calls touch. */
interface ConfigSourceBuilder {
  add(source: IConfigSource): unknown;
}

export namespace ChainedBuilderAugmentations {
  /** Adds `config` as a chained configuration source. */
  export function addConfig<Self extends ConfigSourceBuilder>(this: Self, config: IConfig, shouldDisposeConfig = false): Self {
    return this.add(new ChainedConfigSource({ config, shouldDisposeConfig })) as Self;
  }
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends Flatten<typeof ChainedBuilderAugmentations> {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same namespace
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends Flatten<typeof ChainedBuilderAugmentations> {}
}

registerAugmentations<IConfigBuilder>(ChainedBuilderAugmentations);
