// Public entry point for @rhombus-std/config.ini.
//
// Exports IniConfigSource/Provider (+ the IniStream* pair for in-memory
// payloads) and installs `addIniFile` / `addIniStream` onto config's
// ConfigBuilder AND ConfigManager via the augmentation registry
// (TS declaration merging + a registerAugmentations call against the shared
// IConfigBuilder token). Mirrors config.json's install exactly.
//
// A consumer who only wants the sugar needs a bare side-effect import:
// `import "@rhombus-std/config.ini";`. `sideEffects: true` in package.json
// keeps a bundler from tree-shaking the registration away.

import type { ConfigBuilder, StreamPayload } from '@rhombus-std/config';
import type { IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { IniConfigSource, type IniConfigSourceOptions } from './IniConfigSource';
import { IniStreamConfigSource } from './IniStreamConfigSource';

// Declare-merge onto the config barrel, same reasoning as config.json's
// addJsonFile install: config is dist-referenced, so its flat dist/bundle/index.d.ts
// declares ConfigBuilder/Manager directly and a barrel merge lands
// cleanly even with other provider augmentations present.
declare module '@rhombus-std/config' {
  interface ConfigBuilder<T = IndexedSection> {
    /** Registers an {@link IniConfigSource} reading `path`. */
    addIniFile(path: string, opts?: IniConfigSourceOptions): this;
    /** Registers an {@link IniStreamConfigSource} reading the in-memory `stream`. */
    addIniStream(stream: StreamPayload): this;
  }
}

declare module '@rhombus-std/config' {
  interface ConfigManager {
    /** Registers an {@link IniConfigSource} reading `path`. */
    addIniFile(path: string, opts?: IniConfigSourceOptions): this;
    /** Registers an {@link IniStreamConfigSource} reading the in-memory `stream`. */
    addIniStream(stream: StreamPayload): this;
  }
}

/** One named object literal mirroring the reference `IniConfigExtensions`. */
export const IniConfigAugmentations = {
  addIniFile<TBuilder extends { add(source: IConfigSource): TBuilder; }>(
    builder: TBuilder,
    path: string,
    opts?: IniConfigSourceOptions,
  ): TBuilder {
    return builder.add(new IniConfigSource(path, opts));
  },
  addIniStream<TBuilder extends { add(source: IConfigSource): TBuilder; }>(
    builder: TBuilder,
    stream: StreamPayload,
  ): TBuilder {
    return builder.add(new IniStreamConfigSource(stream));
  },
} satisfies AugmentationSet<ConfigBuilder<unknown>>;

registerAugmentations(tokenfor<IConfigBuilder>(), IniConfigAugmentations);

export { IniConfigProvider } from './IniConfigProvider';
export { IniConfigSource } from './IniConfigSource';
export type { IniConfigSourceOptions } from './IniConfigSource';
export { IniStreamConfigProvider } from './IniStreamConfigProvider';
export { IniStreamConfigSource } from './IniStreamConfigSource';
