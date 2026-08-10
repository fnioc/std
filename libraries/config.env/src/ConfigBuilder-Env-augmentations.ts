// The `addEnvironmentVariables` sugar on the configuration builder.

import type { ConfigBuilder } from '@rhombus-std/config';
import type { IConfigBuilder, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet2, type Flatten, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { EnvironmentVariablesConfigSource,
  type EnvironmentVariablesConfigSourceOptions } from './EnvironmentVariablesConfigSource';

interface IConfigBuilderEnvAugmentations {
  /**
   * Registers an {@link EnvironmentVariablesConfigSource} seeded from
   * `process.env`, per an optional `options.prefix` and
   * `options.variableNameTransformation`.
   */
  addEnvironmentVariables(options?: EnvironmentVariablesConfigSourceOptions): this;
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends IConfigBuilderEnvAugmentations {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same member map
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends IConfigBuilderEnvAugmentations {}
}

export const ConfigBuilderEnvAugmentations: AugmentationSet2<IConfigBuilder, Flatten<IConfigBuilderEnvAugmentations>> =
  {
    addEnvironmentVariables(builder, options) {
      return builder.add(new EnvironmentVariablesConfigSource(options));
    },
  };

registerAugmentations(tokenfor<IConfigBuilder>(), ConfigBuilderEnvAugmentations);
