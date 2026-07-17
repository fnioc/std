// Public entry point for @rhombus-std/config.commandline.
//
// Importing this module installs the `addCommandLine` sugar method onto
// `ConfigBuilder` AND `ConfigManager` via the augmentation
// registry (TS declaration merging + a `registerAugmentations` call against the
// shared IConfigBuilder token) -- the reference extension method targets
// IConfigBuilder, which ConfigManager implements too, and both
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

import type { ConfigBuilder } from '@rhombus-std/config';
import type { IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import { CommandLineConfigSource, type CommandLineConfigSourceOptions } from './CommandLineConfigSource';

// Augmenting the barrel ("@rhombus-std/config"). Config is dist-referenced, so
// providers typecheck against its rolled, flat dist/index.d.ts, where
// ConfigBuilder is declared directly (no re-export chain) -- a
// declare-module merge onto the barrel lands on the class the barrel exposes,
// even with 2+ provider augmentations in one program (pre-#199 this needed a
// `./configuration-builder` subpath; the src barrel re-export split the class).
declare module '@rhombus-std/config' {
  // Generic arity + default MUST match the class (TS2428).
  interface ConfigBuilder<T = IndexedSection> {
    /**
     * Registers a command-line configuration source over `args` (typically
     * `process.argv.slice(2)`), optionally with `switchMappings` for
     * short-switch (`-x`) support. See {@link CommandLineConfigSource}
     * for construction-time validation and {@link CommandLineConfigProvider}
     * for the parse behavior.
     */
    addCommandLine(
      args: readonly string[],
      switchMappings?: CommandLineConfigSourceOptions['switchMappings'],
    ): this;
  }
}

// Same barrel merge for ConfigManager -- see the builder note above.
declare module '@rhombus-std/config' {
  interface ConfigManager {
    /**
     * Registers a command-line configuration source over `args` (typically
     * `process.argv.slice(2)`), optionally with `switchMappings` for
     * short-switch (`-x`) support. See {@link CommandLineConfigSource}
     * for construction-time validation and {@link CommandLineConfigProvider}
     * for the parse behavior.
     */
    addCommandLine(
      args: readonly string[],
      switchMappings?: CommandLineConfigSourceOptions['switchMappings'],
    ): this;
  }
}

// One named object literal mirroring the reference `CommandLineConfigExtensions`
// static class (docs §28/§38), registered against the shared
// IConfigBuilder token (both decorated builders receive it) AND exported
// so the member is the standalone form. `TBuilder` is bounded by "has an add()
// that returns itself" rather than pinned to ConfigBuilder<T> -- see
// @rhombus-std/config's memory/index.ts for the full rationale.
export const CommandLineConfigExtensions = {
  addCommandLine<TBuilder extends { add(source: IConfigSource): TBuilder; }>(
    builder: TBuilder,
    args: readonly string[],
    switchMappings?: CommandLineConfigSourceOptions['switchMappings'],
  ): TBuilder {
    return builder.add(new CommandLineConfigSource(args, { switchMappings }));
  },
} satisfies AugmentationSet<ConfigBuilder<unknown>>;

registerAugmentations(nameof<IConfigBuilder>(), CommandLineConfigExtensions);

export { CommandLineConfigProvider } from './CommandLineConfigProvider';
export { CommandLineConfigSource } from './CommandLineConfigSource';
export type { CommandLineConfigSourceOptions } from './CommandLineConfigSource';
