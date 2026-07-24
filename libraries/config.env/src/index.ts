// Public entry point for @rhombus-std/config.env.
//
// Bolts `addEnvironmentVariables` sugar onto the shared `ConfigBuilder`
// AND `ConfigManager` from @rhombus-std/config via TS declaration
// merging + a `registerAugmentations` call against the shared
// IConfigBuilder token -- the reference extension method targets
// IConfigBuilder, which ConfigManager implements too, and both
// concrete builders are decorated with that one token. A consumer who never
// names a runtime symbol from this package (only wants the sugar) needs a bare
// side-effect import: `import "@rhombus-std/config.env";`.

import type { ConfigBuilder } from '@rhombus-std/config';
import type { IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { EnvironmentVariablesConfigSource,
  type EnvironmentVariablesConfigSourceOptions } from './EnvironmentVariablesConfigSource';

// Augmenting the barrel ("@rhombus-std/config"). Config is dist-referenced, so
// providers typecheck against its rolled, flat dist/bundle/index.d.ts, where
// ConfigBuilder is declared directly (no re-export chain) -- a
// declare-module merge onto the barrel lands on the class the barrel exposes,
// even with 2+ provider augmentations in one program (pre-#199 this needed a
// `./configuration-builder` subpath; the src barrel re-export split the class).
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

// One named object literal mirroring the reference `EnvironmentVariablesExtensions`
// static class (docs §28/§38), registered against the shared
// IConfigBuilder token (both decorated builders receive it) AND exported
// so the member is the standalone form. `TBuilder` is bounded by "has an add()
// that returns itself" rather than pinned to ConfigBuilder<T> -- see
// @rhombus-std/config's memory/index.ts for the full rationale.
export const EnvironmentVariablesExtensions = {
  addEnvironmentVariables<TBuilder extends { add(source: IConfigSource): TBuilder; }>(
    builder: TBuilder,
    options?: EnvironmentVariablesConfigSourceOptions,
  ): TBuilder {
    return builder.add(new EnvironmentVariablesConfigSource(options));
  },
} satisfies AugmentationSet<ConfigBuilder<unknown>>;

registerAugmentations(tokenfor<IConfigBuilder>(), EnvironmentVariablesExtensions);

export { EnvironmentVariablesConfigProvider } from './EnvironmentVariablesConfigProvider';
export { colonAndDotVariableNameTransformation, defaultVariableNameTransformation,
  EnvironmentVariablesConfigSource } from './EnvironmentVariablesConfigSource';
export type { EnvironmentVariablesConfigSourceOptions } from './EnvironmentVariablesConfigSource';
