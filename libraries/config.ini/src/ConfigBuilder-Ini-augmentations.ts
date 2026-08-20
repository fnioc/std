// The `addIniFile` / `addIniStream` sugar on the configuration builder.

import type { StreamPayload } from '@rhombus-std/config';
import type { IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/type-helpers';
import { IniConfigSource, type IniConfigSourceOptions } from './IniConfigSource';
import { IniStreamConfigSource } from './IniStreamConfigSource';

/** The subset of {@link IConfigBuilder} and `config`'s `ConfigBuilder<T>` this sugar's `add` calls touch. */
interface ConfigSourceBuilder {
  add(source: IConfigSource): unknown;
}

export namespace ConfigBuilderIniAugmentations {
  /** Registers an {@link IniConfigSource} reading `path`. */
  export function addIniFile<Self extends ConfigSourceBuilder>(this: Self, path: string, opts?: IniConfigSourceOptions): Self {
    return this.add(new IniConfigSource(path, opts)) as Self;
  }

  /** Registers an {@link IniStreamConfigSource} reading the in-memory `stream`. */
  export function addIniStream<Self extends ConfigSourceBuilder>(this: Self, stream: StreamPayload): Self {
    return this.add(new IniStreamConfigSource(stream)) as Self;
  }
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends Flatten<typeof ConfigBuilderIniAugmentations> {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same namespace
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends Flatten<typeof ConfigBuilderIniAugmentations> {}
}

registerAugmentations<IConfigBuilder>(ConfigBuilderIniAugmentations);
