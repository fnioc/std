// Public entry point for @rhombus-std/config.commandline.
//
// Importing this module installs the `addCommandLine` sugar method onto
// `ConfigurationBuilder` via the extension-method-mimicking augmentation
// pattern (TS declaration merging + a runtime prototype assignment). A
// consumer who never names a runtime symbol from this package (only wants
// the sugar) needs a bare side-effect import: `import
// "@rhombus-std/config.commandline";`.
//
// `@rhombus-std/config` is a peerDependency, kept external in this package's
// bundle (see build.ts/rollup.dts.mjs) -- so the `ConfigurationBuilder` this
// module patches is the SAME class instance the consumer's own
// `@rhombus-std/config` import resolves to, not a private inlined copy.

import { ConfigurationBuilder } from "@rhombus-std/config";
import type { IndexedSection } from "@rhombus-std/config.core";
import { applyAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";
import type { CommandLineConfigurationSourceOptions } from "./command-line-configuration-source";
import { CommandLineConfigurationSource } from "./command-line-configuration-source";

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

// One named object literal mirroring the reference `CommandLineConfigurationExtensions`
// static class (docs §28), installed as a prototype method AND exported so the
// member is the standalone form.
export const CommandLineConfigurationExtensions = {
  addCommandLine<T>(
    builder: ConfigurationBuilder<T>,
    args: readonly string[],
    switchMappings?: CommandLineConfigurationSourceOptions["switchMappings"],
  ): ConfigurationBuilder<T> {
    return builder.add(new CommandLineConfigurationSource(args, { switchMappings }));
  },
} satisfies AugmentationSet<ConfigurationBuilder<unknown>>;

applyAugmentations(ConfigurationBuilder, CommandLineConfigurationExtensions);

export { CommandLineConfigurationProvider } from "./command-line-configuration-provider";
export { CommandLineConfigurationSource } from "./command-line-configuration-source";
export type { CommandLineConfigurationSourceOptions } from "./command-line-configuration-source";
