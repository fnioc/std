// Memory provider barrel + the addInMemoryCollection augmentation.
//
// Even though the Memory provider lives in the same package as ConfigBuilder,
// its sugar method is installed through the same augmentation path the external
// provider packages use: ConfigBuilder itself carries no add* sugar of its own.

import type { IConfigBuilder, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet2, type Flatten, registerAugmentations } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { type ConfigData, MemoryConfigSource } from './MemoryConfigSource';

export { MemoryConfigProvider } from './MemoryConfigProvider';
export { type ConfigData, MemoryConfigSource } from './MemoryConfigSource';

interface IConfigBuilderMemoryAugmentations {
  /** Registers an in-memory configuration source seeded with `initialData`. */
  addInMemoryCollection(initialData?: ConfigData): this;
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends IConfigBuilderMemoryAugmentations {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same member map
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends IConfigBuilderMemoryAugmentations {}
}

export const MemoryConfigBuilderAugmentations: AugmentationSet2<IConfigBuilder,
  Flatten<IConfigBuilderMemoryAugmentations>> = {
    addInMemoryCollection(builder, initialData) {
      return builder.add(new MemoryConfigSource({ initialData }));
    },
  };

registerAugmentations(typefor<IConfigBuilder>(), MemoryConfigBuilderAugmentations);
