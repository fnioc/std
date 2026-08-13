// Chained provider barrel + the addConfig augmentation.

import type { IConfig, IConfigBuilder, IndexedSection } from '@rhombus-std/config.core';
import type { AugmentationSet2, Flatten } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import { ChainedConfigSource } from './ChainedConfigSource';

export { ChainedConfigProvider } from './ChainedConfigProvider';
export { ChainedConfigSource } from './ChainedConfigSource';

interface IConfigBuilderChainedAugmentations {
  /** Adds `config` as a chained configuration source. */
  addConfig(config: IConfig, shouldDisposeConfig?: boolean): this;
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends IConfigBuilderChainedAugmentations {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same member map
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends IConfigBuilderChainedAugmentations {}
}

export const ChainedBuilderAugmentations: AugmentationSet2<IConfigBuilder,
  Flatten<IConfigBuilderChainedAugmentations>> = {
    addConfig(config, shouldDisposeConfig = false) {
      return this.add(new ChainedConfigSource({ config, shouldDisposeConfig }));
    },
  };

registerAugmentations<IConfigBuilder>(ChainedBuilderAugmentations);
