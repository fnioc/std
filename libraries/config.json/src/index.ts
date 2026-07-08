// Public entry point for @rhombus-std/config.json.
//
// Exports JsonConfigurationSource/JsonConfigurationProvider and installs the
// `addJsonFile` sugar onto `@rhombus-std/config`'s ConfigurationBuilder via the
// extension-method-mimicking augmentation pattern (TS declaration merging +
// a runtime prototype assignment).
//
// A consumer who never names a runtime symbol from this package (only wants
// the sugar) needs a bare side-effect import: `import "@rhombus-std/config.json";`.
// This package must NOT set `"sideEffects": false` in package.json (would
// let a bundler tree-shake the augmentation away).

import { ConfigurationBuilder } from "@rhombus-std/config";
import type { IndexedSection } from "@rhombus-std/config.core";
import { applyExtensions, defineExtensions } from "@rhombus-std/primitives";
import { JsonConfigurationSource } from "./json-configuration-source";
import type { JsonConfigurationSourceOptions } from "./json-configuration-source";

// Augmenting the declaring module ("@rhombus-std/config/configuration-builder"),
// NOT the barrel ("@rhombus-std/config") -- TS's declaration merging for a class
// re-exported through another module doesn't merge back onto the class as
// seen through its own declaring module, so augmenting the barrel produces a
// phantom second `ConfigurationBuilder` type the moment another augmentation
// (e.g. core's own addInMemoryCollection) is also in the program. See the
// "configuration-builder-subpath" note in @rhombus-std/config's package.json.
declare module "@rhombus-std/config/configuration-builder" {
  // Generic arity + default MUST match the class (TS2428) -- `<T =
  // IndexedSection>`, same IndexedSection imported from @rhombus-std/config.core.
  interface ConfigurationBuilder<T = IndexedSection> {
    /** Registers a {@link JsonConfigurationSource} reading `path` (resolved against `process.cwd()`). */
    addJsonFile(path: string, opts?: JsonConfigurationSourceOptions): this;
  }
}

// Authored once as a receiver-first function, then installed as a prototype
// method (the primary path) via applyExtensions AND exported standalone (the
// fallback / testing surface) -- the dual-export convention (docs §17).
export const jsonConfigExtensions = defineExtensions<ConfigurationBuilder>()({
  addJsonFile(
    builder: ConfigurationBuilder,
    path: string,
    opts?: JsonConfigurationSourceOptions,
  ): ConfigurationBuilder {
    return builder.add(new JsonConfigurationSource(path, opts));
  },
});

applyExtensions(ConfigurationBuilder, jsonConfigExtensions);

export { JsonConfigurationProvider } from "./json-configuration-provider";
export { JsonConfigurationSource } from "./json-configuration-source";
export type { JsonConfigurationSourceOptions } from "./json-configuration-source";
