// The `addCommandLine` sugar on the configuration builder.

import type { IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/type-helpers';
import { CommandLineConfigSource, type CommandLineConfigSourceOptions } from './CommandLineConfigSource';

/** The subset of {@link IConfigBuilder} and `config`'s `ConfigBuilder<T>` this sugar's `add` call touches. */
interface ConfigSourceBuilder {
  add(source: IConfigSource): unknown;
}

export namespace ConfigBuilderCommandLineAugmentations {
  /**
   * Registers a command-line configuration source over `args` (typically
   * `process.argv.slice(2)`), optionally with `switchMappings` for
   * short-switch (`-x`) support.
   */
  export function addCommandLine<Self extends ConfigSourceBuilder>(this: Self, args: readonly string[],
    switchMappings?: CommandLineConfigSourceOptions['switchMappings']): Self {
    return this.add(new CommandLineConfigSource(args, { switchMappings })) as Self;
  }
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends Flatten<typeof ConfigBuilderCommandLineAugmentations> {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same namespace
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends Flatten<typeof ConfigBuilderCommandLineAugmentations> {}
}

registerAugmentations<IConfigBuilder>(ConfigBuilderCommandLineAugmentations);
