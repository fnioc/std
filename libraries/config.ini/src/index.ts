// Public entry point for @rhombus-std/config.ini.
//
// Exports IniConfigurationSource/Provider (+ the IniStream* pair for in-memory
// payloads) and installs `addIniFile` / `addIniStream` onto config's
// ConfigurationBuilder AND ConfigurationManager via the augmentation registry
// (TS declaration merging + a registerAugmentations call against the shared
// IConfigurationBuilder token). Mirrors config.json's install exactly.
//
// A consumer who only wants the sugar needs a bare side-effect import:
// `import "@rhombus-std/config.ini";`. `sideEffects: true` in package.json
// keeps a bundler from tree-shaking the registration away.

import type { ConfigurationBuilder, StreamPayload } from '@rhombus-std/config';
import type { IConfigurationBuilder, IConfigurationSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives.transformer/internal/nameof';
import { IniConfigurationSource, type IniConfigurationSourceOptions } from './IniConfigurationSource';
import { IniStreamConfigurationSource } from './IniStreamConfigurationSource';

// Declare-merge onto the declaring modules (not the barrel), same reasoning as
// config.json's addJsonFile install -- see @rhombus-std/config's package.json
// "configuration-builder-subpath" note.
declare module '@rhombus-std/config/configuration-builder' {
  interface ConfigurationBuilder<T = IndexedSection> {
    /** Registers an {@link IniConfigurationSource} reading `path`. */
    addIniFile(path: string, opts?: IniConfigurationSourceOptions): this;
    /** Registers an {@link IniStreamConfigurationSource} reading the in-memory `stream`. */
    addIniStream(stream: StreamPayload): this;
  }
}

declare module '@rhombus-std/config/configuration-manager' {
  interface ConfigurationManager {
    /** Registers an {@link IniConfigurationSource} reading `path`. */
    addIniFile(path: string, opts?: IniConfigurationSourceOptions): this;
    /** Registers an {@link IniStreamConfigurationSource} reading the in-memory `stream`. */
    addIniStream(stream: StreamPayload): this;
  }
}

/** One named object literal mirroring the reference `IniConfigurationExtensions`. */
export const IniConfigurationExtensions = {
  addIniFile<TBuilder extends { add(source: IConfigurationSource): TBuilder; }>(
    builder: TBuilder,
    path: string,
    opts?: IniConfigurationSourceOptions,
  ): TBuilder {
    return builder.add(new IniConfigurationSource(path, opts));
  },
  addIniStream<TBuilder extends { add(source: IConfigurationSource): TBuilder; }>(
    builder: TBuilder,
    stream: StreamPayload,
  ): TBuilder {
    return builder.add(new IniStreamConfigurationSource(stream));
  },
} satisfies AugmentationSet<ConfigurationBuilder<unknown>>;

registerAugmentations(nameof<IConfigurationBuilder>(), IniConfigurationExtensions);

export { IniConfigurationProvider } from './IniConfigurationProvider';
export { IniConfigurationSource } from './IniConfigurationSource';
export type { IniConfigurationSourceOptions } from './IniConfigurationSource';
export { IniStreamConfigurationProvider } from './IniStreamConfigurationProvider';
export { IniStreamConfigurationSource } from './IniStreamConfigurationSource';
