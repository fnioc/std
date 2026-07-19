// Public entry point for @rhombus-std/config.xml.
//
// Exports XmlConfigSource/Provider (+ the XmlStream* pair for in-memory
// payloads) and installs `addXmlFile` / `addXmlStream` onto config's
// ConfigBuilder AND ConfigManager via the augmentation registry.
// Mirrors config.json/config.ini's install exactly.
//
// A consumer who only wants the sugar needs a bare side-effect import:
// `import "@rhombus-std/config.xml";`. `sideEffects: true` in package.json keeps
// a bundler from tree-shaking the registration away.

import type { ConfigBuilder, StreamPayload } from '@rhombus-std/config';
import type { IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import { XmlConfigSource, type XmlConfigSourceOptions } from './XmlConfigSource';
import { XmlStreamConfigSource } from './XmlStreamConfigSource';

// Declare-merge onto the config barrel (dist-referenced flat dist/bundle/index.d.ts
// declares the classes directly, so the merge lands cleanly even with other
// provider augmentations present -- see config.json's addJsonFile install).
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> {
    /** Registers an {@link XmlConfigSource} reading `path`. */
    addXmlFile(path: string, opts?: XmlConfigSourceOptions): this;
    /** Registers an {@link XmlStreamConfigSource} reading the in-memory `stream`. */
    addXmlStream(stream: StreamPayload): this;
  }
}

declare module '@rhombus-std/config' {
  interface ConfigManager {
    /** Registers an {@link XmlConfigSource} reading `path`. */
    addXmlFile(path: string, opts?: XmlConfigSourceOptions): this;
    /** Registers an {@link XmlStreamConfigSource} reading the in-memory `stream`. */
    addXmlStream(stream: StreamPayload): this;
  }
}

/** One named object literal mirroring the reference `XmlConfigExtensions`. */
export const XmlConfigAugmentations = {
  addXmlFile<TBuilder extends { add(source: IConfigSource): TBuilder; }>(
    builder: TBuilder,
    path: string,
    opts?: XmlConfigSourceOptions,
  ): TBuilder {
    return builder.add(new XmlConfigSource(path, opts));
  },
  addXmlStream<TBuilder extends { add(source: IConfigSource): TBuilder; }>(
    builder: TBuilder,
    stream: StreamPayload,
  ): TBuilder {
    return builder.add(new XmlStreamConfigSource(stream));
  },
} satisfies AugmentationSet<ConfigBuilder<unknown>>;

registerAugmentations(nameof<IConfigBuilder>(), XmlConfigAugmentations);

export { XmlConfigProvider } from './XmlConfigProvider';
export { XmlConfigSource } from './XmlConfigSource';
export type { XmlConfigSourceOptions } from './XmlConfigSource';
export { XmlStreamConfigProvider } from './XmlStreamConfigProvider';
export { XmlStreamConfigSource } from './XmlStreamConfigSource';
