// Public entry point for @rhombus-std/config.env.
//
// Bolts `addEnvironmentVariables` sugar onto the shared `ConfigurationBuilder`
// AND `ConfigurationManager` from @rhombus-std/config via TS declaration
// merging + a `registerAugmentations` call against the shared
// IConfigurationBuilder token -- the reference extension method targets
// IConfigurationBuilder, which ConfigurationManager implements too, and both
// concrete builders are decorated with that one token. A consumer who never
// names a runtime symbol from this package (only wants the sugar) needs a bare
// side-effect import: `import "@rhombus-std/config.env";`.

import type { ConfigurationBuilder } from '@rhombus-std/config';
import type { IConfigurationBuilder, IConfigurationSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import { EnvironmentVariablesConfigurationSource,
  type EnvironmentVariablesConfigurationSourceOptions } from './environment-variables-configuration-source';

// Augmenting the barrel ("@rhombus-std/config"). Config is dist-referenced, so
// providers typecheck against its rolled, flat dist/index.d.ts, where
// ConfigurationBuilder is declared directly (no re-export chain) -- a
// declare-module merge onto the barrel lands on the class the barrel exposes,
// even with 2+ provider augmentations in one program (pre-#199 this needed a
// `./configuration-builder` subpath; the src barrel re-export split the class).
declare module '@rhombus-std/config' {
  // Generic arity + default MUST match the class (TS2428).
  interface ConfigurationBuilder<T = IndexedSection> {
    /**
     * Registers an {@link EnvironmentVariablesConfigurationSource} seeded from
     * `process.env`, per an optional `options.prefix` and
     * `options.variableNameTransformation`.
     */
    addEnvironmentVariables(options?: EnvironmentVariablesConfigurationSourceOptions): this;
  }
}

// Same barrel merge for ConfigurationManager -- see the builder note above.
declare module '@rhombus-std/config' {
  interface ConfigurationManager {
    /**
     * Registers an {@link EnvironmentVariablesConfigurationSource} seeded from
     * `process.env`, per an optional `options.prefix` and
     * `options.variableNameTransformation`.
     */
    addEnvironmentVariables(options?: EnvironmentVariablesConfigurationSourceOptions): this;
  }
}

// One named object literal mirroring the reference `EnvironmentVariablesExtensions`
// static class (docs §28/§38), registered against the shared
// IConfigurationBuilder token (both decorated builders receive it) AND exported
// so the member is the standalone form. `TBuilder` is bounded by "has an add()
// that returns itself" rather than pinned to ConfigurationBuilder<T> -- see
// @rhombus-std/config's memory/index.ts for the full rationale.
export const EnvironmentVariablesExtensions = {
  addEnvironmentVariables<TBuilder extends { add(source: IConfigurationSource): TBuilder; }>(
    builder: TBuilder,
    options?: EnvironmentVariablesConfigurationSourceOptions,
  ): TBuilder {
    return builder.add(new EnvironmentVariablesConfigurationSource(options));
  },
} satisfies AugmentationSet<ConfigurationBuilder<unknown>>;

registerAugmentations(nameof<IConfigurationBuilder>(), EnvironmentVariablesExtensions);

export { colonAndDotVariableNameTransformation, defaultVariableNameTransformation,
  EnvironmentVariablesConfigurationSource } from './environment-variables-configuration-source';
export type { EnvironmentVariablesConfigurationSourceOptions } from './environment-variables-configuration-source';
export { EnvironmentVariablesConfigurationProvider } from './EnvironmentVariablesConfigurationProvider';
