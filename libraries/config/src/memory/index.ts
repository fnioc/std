// Memory provider barrel + the addInMemoryCollection augmentation.
//
// Even though the Memory provider lives in the same package as ConfigBuilder,
// its sugar method is installed through the same augmentation path the external
// provider packages use: ConfigBuilder itself carries no add* sugar of its own.

import type { IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/types';
import { type ConfigData, MemoryConfigSource } from './MemoryConfigSource';

export { MemoryConfigProvider } from './MemoryConfigProvider';
export { type ConfigData, MemoryConfigSource } from './MemoryConfigSource';

/** The subset of {@link IConfigBuilder} and `config`'s `ConfigBuilder<T>` this sugar's `add` calls touch. */
interface ConfigSourceBuilder {
  add(source: IConfigSource): unknown;
}

export namespace MemoryConfigBuilderAugmentations {
  /** Registers an in-memory configuration source seeded with `initialData`. */
  export function addInMemoryCollection<Self extends ConfigSourceBuilder>(this: Self, initialData?: ConfigData): Self {
    return this.add(new MemoryConfigSource({ initialData })) as Self;
  }
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends Flatten<typeof MemoryConfigBuilderAugmentations> {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same namespace
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends Flatten<typeof MemoryConfigBuilderAugmentations> {}
}

registerAugmentations<IConfigBuilder>(MemoryConfigBuilderAugmentations);
