// Public entry point for @rhombus-std/config.env.
//
// Importing this module installs the `addEnvironmentVariables` sugar onto BOTH
// `ConfigBuilder` and `ConfigManager`: declaration merging for the types, plus a
// `registerAugmentations` call against the shared IConfigBuilder token both
// concrete builders are decorated with. A consumer who only wants the sugar
// (never naming a runtime symbol from this package) needs a bare side-effect
// import: `import "@rhombus-std/config.env";`.

import type { ConfigBuilder } from '@rhombus-std/config';
import type { IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { EnvironmentVariablesConfigSource,
  type EnvironmentVariablesConfigSourceOptions } from './EnvironmentVariablesConfigSource';

// Augmenting the barrel ("@rhombus-std/config"): config is dist-referenced, so
// providers typecheck against its rolled, flat index.d.ts, where ConfigBuilder is
// declared directly (no re-export chain) -- a declare-module merge onto the
// barrel therefore lands on the class the barrel exposes, even with 2+ provider
// augmentations in one program.
declare module '@rhombus-std/config' {
  // Generic arity + default MUST match the class (TS2428).
  interface ConfigBuilder<T = IndexedSection> {
    /**
     * Registers an {@link EnvironmentVariablesConfigSource} seeded from
     * `process.env`, per an optional `options.prefix` and
     * `options.variableNameTransformation`.
     */
    addEnvironmentVariables(options?: EnvironmentVariablesConfigSourceOptions): this;
  }
}

// Same barrel merge for ConfigManager -- see the builder note above.
declare module '@rhombus-std/config' {
  interface ConfigManager {
    /**
     * Registers an {@link EnvironmentVariablesConfigSource} seeded from
     * `process.env`, per an optional `options.prefix` and
     * `options.variableNameTransformation`.
     */
    addEnvironmentVariables(options?: EnvironmentVariablesConfigSourceOptions): this;
  }
}

// The standalone form of the member, also registered against the shared
// IConfigBuilder token so both decorated builders receive it. `TBuilder` is
// bounded by "has an add() that returns itself" rather than pinned to
// ConfigBuilder<T>, so ConfigManager satisfies it too.
export const EnvironmentVariablesExtensions = {
  addEnvironmentVariables<TBuilder extends { add(source: IConfigSource): TBuilder; }>(builder: TBuilder,
    options?: EnvironmentVariablesConfigSourceOptions): TBuilder {
    return builder.add(new EnvironmentVariablesConfigSource(options));
  },
} satisfies AugmentationSet<ConfigBuilder<unknown>>;

registerAugmentations(tokenfor<IConfigBuilder>(), EnvironmentVariablesExtensions);

export { EnvironmentVariablesConfigProvider } from './EnvironmentVariablesConfigProvider';
export { colonAndDotVariableNameTransformation, defaultVariableNameTransformation,
  EnvironmentVariablesConfigSource } from './EnvironmentVariablesConfigSource';
export type { EnvironmentVariablesConfigSourceOptions } from './EnvironmentVariablesConfigSource';
