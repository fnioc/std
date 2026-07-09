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

import type { ConfigurationBuilder } from "@rhombus-std/config";
import { CONFIGURATION_BUILDER_AUGMENTATION_TOKEN } from "@rhombus-std/config.core";
import type { IConfigurationSource, IndexedSection } from "@rhombus-std/config.core";
import { registerAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";
import {
  EnvironmentVariablesConfigurationSource,
  type EnvironmentVariablesConfigurationSourceOptions,
} from "./environment-variables-configuration-source";

declare module "@rhombus-std/config/configuration-builder" {
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

// Same declare-merge-onto-the-declaring-module reasoning as above -- see the
// "configuration-manager-subpath" note in @rhombus-std/config's package.json.
declare module "@rhombus-std/config/configuration-manager" {
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
  addEnvironmentVariables<TBuilder extends { add(source: IConfigurationSource): TBuilder }>(
    builder: TBuilder,
    options?: EnvironmentVariablesConfigurationSourceOptions,
  ): TBuilder {
    return builder.add(new EnvironmentVariablesConfigurationSource(options));
  },
} satisfies AugmentationSet<ConfigurationBuilder<unknown>>;

registerAugmentations(CONFIGURATION_BUILDER_AUGMENTATION_TOKEN, EnvironmentVariablesExtensions);

export { EnvironmentVariablesConfigurationProvider } from "./environment-variables-configuration-provider";
export {
  colonAndDotVariableNameTransformation,
  defaultVariableNameTransformation,
  EnvironmentVariablesConfigurationSource,
} from "./environment-variables-configuration-source";
export type { EnvironmentVariablesConfigurationSourceOptions } from "./environment-variables-configuration-source";
