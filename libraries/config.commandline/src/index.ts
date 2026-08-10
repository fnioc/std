// Public entry point for @rhombus-std/config.commandline.
//
// Importing this module installs the `addCommandLine` sugar onto BOTH
// `ConfigBuilder` and `ConfigManager`: declaration merging for the types, plus a
// `registerAugmentations` call against the shared IConfigBuilder token both
// concrete builders are decorated with. A consumer who only wants the sugar
// (never naming a runtime symbol from this package) needs a bare side-effect
// import: `import "@rhombus-std/config.commandline";`.
//
// `@rhombus-std/config` and `@rhombus-std/primitives` MUST stay external in this
// package's bundle. An inlined copy would decorate a private duplicate of the
// builder classes and fork the registry's Map, so the sugar would never reach
// the classes the consumer's own imports resolve to.

import type { ConfigBuilder } from '@rhombus-std/config';
import type { IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { CommandLineConfigSource, type CommandLineConfigSourceOptions } from './CommandLineConfigSource';

// Augmenting the barrel ("@rhombus-std/config"): config is dist-referenced, so
// providers typecheck against its rolled, flat index.d.ts, where ConfigBuilder is
// declared directly (no re-export chain) -- a declare-module merge onto the
// barrel therefore lands on the class the barrel exposes, even with 2+ provider
// augmentations in one program.
declare module '@rhombus-std/config' {
  // Generic arity + default MUST match the class (TS2428).
  interface ConfigBuilder<T = IndexedSection> {
    /**
     * Registers a command-line configuration source over `args` (typically
     * `process.argv.slice(2)`), optionally with `switchMappings` for
     * short-switch (`-x`) support.
     */
    addCommandLine(args: readonly string[], switchMappings?: CommandLineConfigSourceOptions['switchMappings']): this;
  }
}

// Same barrel merge for ConfigManager -- see the builder note above.
declare module '@rhombus-std/config' {
  interface ConfigManager {
    /**
     * Registers a command-line configuration source over `args` (typically
     * `process.argv.slice(2)`), optionally with `switchMappings` for
     * short-switch (`-x`) support.
     */
    addCommandLine(args: readonly string[], switchMappings?: CommandLineConfigSourceOptions['switchMappings']): this;
  }
}

// The standalone form of the member, also registered against the shared
// IConfigBuilder token so both decorated builders receive it. `TBuilder` is
// bounded by "has an add() that returns itself" rather than pinned to
// ConfigBuilder<T>, so ConfigManager satisfies it too.
export const CommandLineConfigAugmentations = {
  addCommandLine<TBuilder extends { add(source: IConfigSource): TBuilder; }>(builder: TBuilder, args: readonly string[],
    switchMappings?: CommandLineConfigSourceOptions['switchMappings']): TBuilder {
    return builder.add(new CommandLineConfigSource(args, { switchMappings }));
  },
} satisfies AugmentationSet<ConfigBuilder<unknown>>;

registerAugmentations(tokenfor<IConfigBuilder>(), CommandLineConfigAugmentations);

export { CommandLineConfigProvider } from './CommandLineConfigProvider';
export { CommandLineConfigSource } from './CommandLineConfigSource';
export type { CommandLineConfigSourceOptions } from './CommandLineConfigSource';
