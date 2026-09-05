// The `addXmlFile` / `addXmlStream` sugar on the configuration builder.

import type { StreamPayload } from '@rhombus-std/config';
import type { IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/types';
import { XmlConfigSource, type XmlConfigSourceOptions } from './XmlConfigSource';
import { XmlStreamConfigSource } from './XmlStreamConfigSource';

/** The subset of {@link IConfigBuilder} and `config`'s `ConfigBuilder<T>` this sugar's `add` calls touch. */
interface ConfigSourceBuilder {
  add(source: IConfigSource): unknown;
}

export namespace ConfigBuilderXmlAugmentations {
  /** Registers an {@link XmlConfigSource} reading `path`. */
  export function addXmlFile<Self extends ConfigSourceBuilder>(this: Self, path: string, opts?: XmlConfigSourceOptions): Self {
    return this.add(new XmlConfigSource(path, opts)) as Self;
  }

  /** Registers an {@link XmlStreamConfigSource} reading the in-memory `stream`. */
  export function addXmlStream<Self extends ConfigSourceBuilder>(this: Self, stream: StreamPayload): Self {
    return this.add(new XmlStreamConfigSource(stream)) as Self;
  }
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends Flatten<typeof ConfigBuilderXmlAugmentations> {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same namespace
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends Flatten<typeof ConfigBuilderXmlAugmentations> {}
}

registerAugmentations<IConfigBuilder>(ConfigBuilderXmlAugmentations);
