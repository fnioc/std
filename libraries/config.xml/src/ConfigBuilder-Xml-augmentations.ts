// The `addXmlFile` / `addXmlStream` sugar on the configuration builder.

import type { StreamPayload } from '@rhombus-std/config';
import type { IConfigBuilder, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet2, type Flatten, registerAugmentations } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { XmlConfigSource, type XmlConfigSourceOptions } from './XmlConfigSource';
import { XmlStreamConfigSource } from './XmlStreamConfigSource';

interface IConfigBuilderXmlAugmentations {
  /** Registers an {@link XmlConfigSource} reading `path`. */
  addXmlFile(path: string, opts?: XmlConfigSourceOptions): this;
  /** Registers an {@link XmlStreamConfigSource} reading the in-memory `stream`. */
  addXmlStream(stream: StreamPayload): this;
}

declare module '@rhombus-std/config.core' {
  interface IConfigBuilder extends IConfigBuilderXmlAugmentations {}
}

// ConfigBuilder<T> cannot extend IConfigBuilder -- its `build()` returns the
// schema-typed T, not an IConfigRoot -- so it merges the same member map
// directly. Its generic arity and default MUST match the class declaration or
// the merge fails (TS2428). ConfigManager needs no block of its own: it reaches
// the members through IConfigManager, which does extend IConfigBuilder.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> extends IConfigBuilderXmlAugmentations {}
}

export const ConfigBuilderXmlAugmentations: AugmentationSet2<IConfigBuilder, Flatten<IConfigBuilderXmlAugmentations>> =
  {
    addXmlFile(builder, path, opts) {
      return builder.add(new XmlConfigSource(path, opts));
    },
    addXmlStream(builder, stream) {
      return builder.add(new XmlStreamConfigSource(stream));
    },
  };

registerAugmentations(typefor<IConfigBuilder>(), ConfigBuilderXmlAugmentations);
