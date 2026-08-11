// The `addIniFile` / `addIniStream` sugar on the configuration builder.

import type { ConfigBuilder, StreamPayload } from '@rhombus-std/config';
import type { IConfigBuilder, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet2, type Flatten, registerAugmentations } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { IniConfigSource, type IniConfigSourceOptions } from './IniConfigSource';
import { IniStreamConfigSource } from './IniStreamConfigSource';

interface IConfigBuilderIniAugmentations {
  /** Registers an {@link IniConfigSource} reading `path`. */
  addIniFile(path: string, opts?: IniConfigSourceOptions): this;
  /** Registers an {@link IniStreamConfigSource} reading the in-memory `stream`. */
  addIniStream(stream: StreamPayload): this;
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends IConfigBuilderIniAugmentations {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same member map
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends IConfigBuilderIniAugmentations {}
}

export const ConfigBuilderIniAugmentations: AugmentationSet2<IConfigBuilder, Flatten<IConfigBuilderIniAugmentations>> =
  {
    addIniFile(builder, path, opts) {
      return builder.add(new IniConfigSource(path, opts));
    },
    addIniStream(builder, stream) {
      return builder.add(new IniStreamConfigSource(stream));
    },
  };

registerAugmentations(typefor<IConfigBuilder>(), ConfigBuilderIniAugmentations);
