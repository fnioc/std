// The `addCommandLine` sugar on the configuration builder.

import type { IConfigBuilder, IndexedSection } from '@rhombus-std/config.core';
import type { AugmentationSet2, Flatten } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import { CommandLineConfigSource, type CommandLineConfigSourceOptions } from './CommandLineConfigSource';

interface IConfigBuilderCommandLineAugmentations {
  /**
   * Registers a command-line configuration source over `args` (typically
   * `process.argv.slice(2)`), optionally with `switchMappings` for
   * short-switch (`-x`) support.
   */
  addCommandLine(args: readonly string[], switchMappings?: CommandLineConfigSourceOptions['switchMappings']): this;
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends IConfigBuilderCommandLineAugmentations {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same member map
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends IConfigBuilderCommandLineAugmentations {}
}

export const ConfigBuilderCommandLineAugmentations: AugmentationSet2<IConfigBuilder,
  Flatten<IConfigBuilderCommandLineAugmentations>> = {
    addCommandLine(args, switchMappings) {
      return this.add(new CommandLineConfigSource(args, { switchMappings }));
    },
  };

registerAugmentations<IConfigBuilder>(ConfigBuilderCommandLineAugmentations);
