// Public entry point for @rhombus-std/config.xml.
//
// Exports XmlConfigurationSource/Provider (+ the XmlStream* pair for in-memory
// payloads) and installs `addXmlFile` / `addXmlStream` onto config's
// ConfigurationBuilder AND ConfigurationManager via the augmentation registry.
// Mirrors config.json/config.ini's install exactly.
//
// A consumer who only wants the sugar needs a bare side-effect import:
// `import "@rhombus-std/config.xml";`. `sideEffects: true` in package.json keeps
// a bundler from tree-shaking the registration away.

import type { ConfigurationBuilder, StreamPayload } from '@rhombus-std/config';
import type { IConfigurationBuilder, IConfigurationSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives.transformer/internal/nameof';
import { XmlConfigurationSource, type XmlConfigurationSourceOptions } from './XmlConfigurationSource';
import { XmlStreamConfigurationSource } from './XmlStreamConfigurationSource';

declare module '@rhombus-std/config/configuration-builder' {
  interface ConfigurationBuilder<T = IndexedSection> {
    /** Registers an {@link XmlConfigurationSource} reading `path`. */
    addXmlFile(path: string, opts?: XmlConfigurationSourceOptions): this;
    /** Registers an {@link XmlStreamConfigurationSource} reading the in-memory `stream`. */
    addXmlStream(stream: StreamPayload): this;
  }
}

declare module '@rhombus-std/config/configuration-manager' {
  interface ConfigurationManager {
    /** Registers an {@link XmlConfigurationSource} reading `path`. */
    addXmlFile(path: string, opts?: XmlConfigurationSourceOptions): this;
    /** Registers an {@link XmlStreamConfigurationSource} reading the in-memory `stream`. */
    addXmlStream(stream: StreamPayload): this;
  }
}

/** One named object literal mirroring the reference `XmlConfigurationExtensions`. */
export const XmlConfigurationExtensions = {
  addXmlFile<TBuilder extends { add(source: IConfigurationSource): TBuilder; }>(
    builder: TBuilder,
    path: string,
    opts?: XmlConfigurationSourceOptions,
  ): TBuilder {
    return builder.add(new XmlConfigurationSource(path, opts));
  },
  addXmlStream<TBuilder extends { add(source: IConfigurationSource): TBuilder; }>(
    builder: TBuilder,
    stream: StreamPayload,
  ): TBuilder {
    return builder.add(new XmlStreamConfigurationSource(stream));
  },
} satisfies AugmentationSet<ConfigurationBuilder<unknown>>;

registerAugmentations(nameof<IConfigurationBuilder>(), XmlConfigurationExtensions);

export { XmlConfigurationProvider } from './XmlConfigurationProvider';
export { XmlConfigurationSource } from './XmlConfigurationSource';
export type { XmlConfigurationSourceOptions } from './XmlConfigurationSource';
export { XmlStreamConfigurationProvider } from './XmlStreamConfigurationProvider';
export { XmlStreamConfigurationSource } from './XmlStreamConfigurationSource';
