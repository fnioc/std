// Public entry point for @rhombus-std/config.commandline.
//
// Importing this module installs the `addCommandLine` sugar method onto
// `ConfigurationBuilder` AND `ConfigurationManager` via the augmentation
// registry (TS declaration merging + a `registerAugmentations` call against the
// shared IConfigurationBuilder token) -- the reference extension method targets
// IConfigurationBuilder, which ConfigurationManager implements too, and both
// concrete builders are decorated with that one token. A consumer who never
// names a runtime symbol from this package (only wants the sugar) needs a bare
// side-effect import: `import "@rhombus-std/config.commandline";`.
//
// `@rhombus-std/config` is a peerDependency, kept external in this package's
// bundle (see build.ts/rollup.dts.mjs) -- so the decorated classes the
// registration reaches are the SAME class instances the consumer's own
// `@rhombus-std/config` import resolves to, not a private inlined copy. The
// same holds for `@rhombus-std/primitives`, which MUST stay external so the
// registry's Map + bus are not forked (docs/decisions.md §9/§38).

import type { ConfigurationBuilder } from "@rhombus-std/config";
import type { IConfigurationBuilder, IConfigurationSource, IndexedSection } from "@rhombus-std/config.core";
import { type AugmentationSet, registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import {
  CommandLineConfigurationSource,
  type CommandLineConfigurationSourceOptions,
} from "./command-line-configuration-source";

// Augmenting the declaring module ("@rhombus-std/config/configuration-builder"),
// NOT the barrel ("@rhombus-std/config") -- TS's declaration merging for a class
// re-exported through another module doesn't merge back onto the class as
// seen through its own declaring module, so augmenting the barrel produces a
// phantom second `ConfigurationBuilder` type the moment another augmentation
// (e.g. core's own addInMemoryCollection, or config-json's addJsonFile) is
// also in the program. See the "configuration-builder-subpath" note in
// @rhombus-std/config's package.json.
declare module "@rhombus-std/config/configuration-builder" {
  // Generic arity + default MUST match the class (TS2428).
  interface ConfigurationBuilder<T = IndexedSection> {
    /**
     * Registers a command-line configuration source over `args` (typically
     * `process.argv.slice(2)`), optionally with `switchMappings` for
     * short-switch (`-x`) support. See {@link CommandLineConfigurationSource}
     * for construction-time validation and {@link CommandLineConfigurationProvider}
     * for the parse behavior.
     */
    addCommandLine(
      args: readonly string[],
      switchMappings?: CommandLineConfigurationSourceOptions["switchMappings"],
    ): this;
  }
}

// Same declare-merge-onto-the-declaring-module reasoning as above -- see the
// "configuration-manager-subpath" note in @rhombus-std/config's package.json.
declare module "@rhombus-std/config/configuration-manager" {
  interface ConfigurationManager {
    /**
     * Registers a command-line configuration source over `args` (typically
     * `process.argv.slice(2)`), optionally with `switchMappings` for
     * short-switch (`-x`) support. See {@link CommandLineConfigurationSource}
     * for construction-time validation and {@link CommandLineConfigurationProvider}
     * for the parse behavior.
     */
    addCommandLine(
      args: readonly string[],
      switchMappings?: CommandLineConfigurationSourceOptions["switchMappings"],
    ): this;
  }
}

// One named object literal mirroring the reference `CommandLineConfigurationExtensions`
// static class (docs §28/§38), registered against the shared
// IConfigurationBuilder token (both decorated builders receive it) AND exported
// so the member is the standalone form. `TBuilder` is bounded by "has an add()
// that returns itself" rather than pinned to ConfigurationBuilder<T> -- see
// @rhombus-std/config's memory/index.ts for the full rationale.
export const CommandLineConfigurationExtensions = {
  addCommandLine<TBuilder extends { add(source: IConfigurationSource): TBuilder }>(
    builder: TBuilder,
    args: readonly string[],
    switchMappings?: CommandLineConfigurationSourceOptions["switchMappings"],
  ): TBuilder {
    return builder.add(new CommandLineConfigurationSource(args, { switchMappings }));
  },
} satisfies AugmentationSet<ConfigurationBuilder<unknown>>;

registerAugmentations(nameof<IConfigurationBuilder>(), CommandLineConfigurationExtensions);

export { CommandLineConfigurationSource } from "./command-line-configuration-source";
export type { CommandLineConfigurationSourceOptions } from "./command-line-configuration-source";
export { CommandLineConfigurationProvider } from "./CommandLineConfigurationProvider";
