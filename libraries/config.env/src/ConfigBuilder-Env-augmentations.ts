// The `addEnvironmentVariables` sugar on the configuration builder.

import type { IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { type Flatten } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import { EnvironmentVariablesConfigSource,
  type EnvironmentVariablesConfigSourceOptions } from './EnvironmentVariablesConfigSource';

/** The subset of {@link IConfigBuilder} and `config`'s `ConfigBuilder<T>` this sugar's `add` call touches. */
interface ConfigSourceBuilder {
  add(source: IConfigSource): unknown;
}

export namespace ConfigBuilderEnvAugmentations {
  /**
   * Registers an {@link EnvironmentVariablesConfigSource} seeded from
   * `process.env`, per an optional `options.prefix` and
   * `options.variableNameTransformation`.
   */
  export function addEnvironmentVariables<Self extends ConfigSourceBuilder>(this: Self,
    options?: EnvironmentVariablesConfigSourceOptions): Self {
    return this.add(new EnvironmentVariablesConfigSource(options)) as Self;
  }
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends Flatten<typeof ConfigBuilderEnvAugmentations> {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same namespace
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends Flatten<typeof ConfigBuilderEnvAugmentations> {}
}

registerAugmentations<IConfigBuilder>(ConfigBuilderEnvAugmentations);
