// Public entry point for @rhombus-std/config.json.
//
// Exports JsonConfigurationSource/JsonConfigurationProvider and installs the
// `addJsonFile` sugar onto `@rhombus-std/config`'s ConfigurationBuilder AND
// ConfigurationManager via the augmentation registry (TS declaration merging +
// a `registerAugmentations` call against the shared IConfigurationBuilder
// token) -- the reference extension method targets IConfigurationBuilder, which
// ConfigurationManager implements too. Both concrete builders are decorated
// with that one token, so a single registration reaches BOTH, and
// `manager.addJsonFile(...)` works the same way `builder.addJsonFile(...)` does.
//
// A consumer who never names a runtime symbol from this package (only wants
// the sugar) needs a bare side-effect import: `import "@rhombus-std/config.json";`.
// This package must NOT set `"sideEffects": false` in package.json (would
// let a bundler tree-shake the augmentation away).

import type { ConfigurationBuilder } from "@rhombus-std/config";
import type { IConfigurationBuilder, IConfigurationSource, IndexedSection } from "@rhombus-std/config.core";
import { type AugmentationSet, registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import { JsonConfigurationSource, type JsonConfigurationSourceOptions } from "./json-configuration-source";

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

// Same "declare-merge onto the declaring module, not the barrel" reasoning as
// above -- see the "configuration-manager-subpath" note in
// @rhombus-std/config's package.json. ConfigurationManager has no generic
// type parameter, so there's no TS2428 arity concern here.
declare module "@rhombus-std/config/configuration-manager" {
  interface ConfigurationManager {
    /** Registers a {@link JsonConfigurationSource} reading `path` (resolved against `process.cwd()`). */
    addJsonFile(path: string, opts?: JsonConfigurationSourceOptions): this;
  }
}

// One named object literal mirroring the reference `JsonConfigurationExtensions`
// static class (docs §28/§38): its members are the class's static methods,
// receiver-first. Registered against the shared IConfigurationBuilder token
// (the primary path -- both decorated builders receive it) AND exported so the
// member is the standalone form. `TBuilder` is bounded by "has an add() that
// returns itself" rather than pinned to ConfigurationBuilder<T> -- see
// @rhombus-std/config's memory/index.ts for the full rationale -- so this one
// object literal satisfies `AugmentationSet` for both classes while
// preserving each receiver's own concrete return type.
export const JsonConfigurationExtensions = {
  addJsonFile<TBuilder extends { add(source: IConfigurationSource): TBuilder }>(
    builder: TBuilder,
    path: string,
    opts?: JsonConfigurationSourceOptions,
  ): TBuilder {
    return builder.add(new JsonConfigurationSource(path, opts));
  },
} satisfies AugmentationSet<ConfigurationBuilder<unknown>>;

registerAugmentations(nameof<IConfigurationBuilder>(), JsonConfigurationExtensions);

export { JsonConfigurationSource } from "./json-configuration-source";
export type { JsonConfigurationSourceOptions } from "./json-configuration-source";
export { JsonConfigurationProvider } from "./JsonConfigurationProvider";
