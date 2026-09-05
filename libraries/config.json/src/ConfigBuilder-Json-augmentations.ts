// The `addJsonFile` / `addJsonStream` sugar on the configuration builder.

import type { StreamPayload } from '@rhombus-std/config';
import type { IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/types';
import { JsonConfigSource, type JsonConfigSourceOptions } from './JsonConfigSource';
import { JsonStreamConfigSource } from './JsonStreamConfigSource';

/** The subset of {@link IConfigBuilder} and `config`'s `ConfigBuilder<T>` this sugar's `add` calls touch. */
interface ConfigSourceBuilder {
  add(source: IConfigSource): unknown;
}

export namespace ConfigBuilderJsonAugmentations {
  /** Registers a {@link JsonConfigSource} reading `path` (resolved against `process.cwd()`). */
  export function addJsonFile<Self extends ConfigSourceBuilder>(this: Self, path: string, opts?: JsonConfigSourceOptions): Self {
    return this.add(new JsonConfigSource(path, opts)) as Self;
  }

  /** Registers a {@link JsonStreamConfigSource} reading the in-memory `stream` payload. */
  export function addJsonStream<Self extends ConfigSourceBuilder>(this: Self, stream: StreamPayload): Self {
    return this.add(new JsonStreamConfigSource(stream)) as Self;
  }
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends Flatten<typeof ConfigBuilderJsonAugmentations> {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same namespace
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends Flatten<typeof ConfigBuilderJsonAugmentations> {}
}

registerAugmentations<IConfigBuilder>(ConfigBuilderJsonAugmentations);
