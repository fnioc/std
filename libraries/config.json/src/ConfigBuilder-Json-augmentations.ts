// The `addJsonFile` / `addJsonStream` sugar on the configuration builder.

import type { StreamPayload } from '@rhombus-std/config';
import type { IConfigBuilder, IndexedSection } from '@rhombus-std/config.core';
import type { AugmentationSet2, Flatten } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import { JsonConfigSource, type JsonConfigSourceOptions } from './JsonConfigSource';
import { JsonStreamConfigSource } from './JsonStreamConfigSource';

interface IConfigBuilderJsonAugmentations {
  /** Registers a {@link JsonConfigSource} reading `path` (resolved against `process.cwd()`). */
  addJsonFile(path: string, opts?: JsonConfigSourceOptions): this;
  /** Registers a {@link JsonStreamConfigSource} reading the in-memory `stream` payload. */
  addJsonStream(stream: StreamPayload): this;
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends IConfigBuilderJsonAugmentations {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same member map
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends IConfigBuilderJsonAugmentations {}
}

export const ConfigBuilderJsonAugmentations: AugmentationSet2<IConfigBuilder,
  Flatten<IConfigBuilderJsonAugmentations>> = {
    addJsonFile(builder, path, opts) {
      return builder.add(new JsonConfigSource(path, opts));
    },
    addJsonStream(builder, stream) {
      return builder.add(new JsonStreamConfigSource(stream));
    },
  };

registerAugmentations<IConfigBuilder>(ConfigBuilderJsonAugmentations);
