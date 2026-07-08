// Public entry point for @rhombus-std/config.env.
//
// Bolts `addEnvironmentVariables` sugar onto the shared `ConfigurationBuilder`
// from @rhombus-std/config via TS declaration merging + a runtime prototype
// assignment, mimicking an extension method. A consumer who never names a
// runtime symbol from this package (only wants the sugar) needs a bare
// side-effect import: `import "@rhombus-std/config.env";`.

import { ConfigurationBuilder } from "@rhombus-std/config";
import type { IndexedSection } from "@rhombus-std/config.core";
import { applyExtensions, defineExtensions } from "@rhombus-std/primitives";
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

// Dual-export (docs §17): a receiver-first function installed as a prototype
// method AND exported standalone.
export const envConfigExtensions = defineExtensions<ConfigurationBuilder>()({
  addEnvironmentVariables(
    builder: ConfigurationBuilder,
    options?: EnvironmentVariablesConfigurationSourceOptions,
  ): ConfigurationBuilder {
    return builder.add(new EnvironmentVariablesConfigurationSource(options));
  },
});

applyExtensions(ConfigurationBuilder, envConfigExtensions);

export { EnvironmentVariablesConfigurationProvider } from "./environment-variables-configuration-provider";
export {
  defaultVariableNameTransformation,
  EnvironmentVariablesConfigurationSource,
} from "./environment-variables-configuration-source";
export type { EnvironmentVariablesConfigurationSourceOptions } from "./environment-variables-configuration-source";
