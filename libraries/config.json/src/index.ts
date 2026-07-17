// Public entry point for @rhombus-std/config.json.
//
// Exports JsonConfigSource/JsonConfigProvider (+ the
// JsonStream* pair for in-memory payloads) and installs the `addJsonFile` /
// `addJsonStream` sugar onto `@rhombus-std/config`'s ConfigBuilder AND
// ConfigManager via the augmentation registry (TS declaration merging +
// a `registerAugmentations` call against the shared IConfigBuilder
// token) -- the reference extension methods target IConfigBuilder, which
// ConfigManager implements too. Both concrete builders are decorated
// with that one token, so a single registration reaches BOTH, and
// `manager.addJsonFile(...)` works the same way `builder.addJsonFile(...)` does.
//
// A consumer who never names a runtime symbol from this package (only wants
// the sugar) needs a bare side-effect import: `import "@rhombus-std/config.json";`.
// This package must NOT set `"sideEffects": false` in package.json (would
// let a bundler tree-shake the augmentation away).

import type { ConfigBuilder, StreamPayload } from '@rhombus-std/config';
import type { IConfigBuilder, IConfigSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import { JsonConfigSource, type JsonConfigSourceOptions } from './JsonConfigSource';
import { JsonStreamConfigSource } from './JsonStreamConfigSource';

// Augmenting the barrel ("@rhombus-std/config"). Config is dist-referenced, so
// providers typecheck against its rolled, flat dist/index.d.ts, where
// ConfigBuilder is declared directly (no re-export chain) -- a
// declare-module merge onto the barrel lands on the same class the barrel
// exposes, even with 2+ provider augmentations in one program. (Pre-#199 this
// had to target a `./configuration-builder` subpath: providers then saw
// config's src barrel, which re-exports the class, and a re-exported class
// won't declaration-merge -- 2+ augmenters split it into phantom types.)
declare module '@rhombus-std/config' {
  // Generic arity + default MUST match the class (TS2428) -- `<T =
  // IndexedSection>`, same IndexedSection imported from @rhombus-std/config.core.
  interface ConfigBuilder<T = IndexedSection> {
    /** Registers a {@link JsonConfigSource} reading `path` (resolved against `process.cwd()`). */
    addJsonFile(path: string, opts?: JsonConfigSourceOptions): this;
    /** Registers a {@link JsonStreamConfigSource} reading the in-memory `stream` payload. */
    addJsonStream(stream: StreamPayload): this;
  }
}

// Same barrel merge for ConfigManager -- see the builder note above.
// ConfigManager has no generic type parameter, so no TS2428 arity concern.
declare module '@rhombus-std/config' {
  interface ConfigManager {
    /** Registers a {@link JsonConfigSource} reading `path` (resolved against `process.cwd()`). */
    addJsonFile(path: string, opts?: JsonConfigSourceOptions): this;
    /** Registers a {@link JsonStreamConfigSource} reading the in-memory `stream` payload. */
    addJsonStream(stream: StreamPayload): this;
  }
}

// One named object literal mirroring the reference `JsonConfigExtensions`
// static class (docs §28/§38): its members are the class's static methods,
// receiver-first. Registered against the shared IConfigBuilder token
// (the primary path -- both decorated builders receive it) AND exported so the
// member is the standalone form. `TBuilder` is bounded by "has an add() that
// returns itself" rather than pinned to ConfigBuilder<T> -- see
// @rhombus-std/config's memory/index.ts for the full rationale -- so this one
// object literal satisfies `AugmentationSet` for both classes while
// preserving each receiver's own concrete return type.
export const JsonConfigExtensions = {
  addJsonFile<TBuilder extends { add(source: IConfigSource): TBuilder; }>(
    builder: TBuilder,
    path: string,
    opts?: JsonConfigSourceOptions,
  ): TBuilder {
    return builder.add(new JsonConfigSource(path, opts));
  },
  addJsonStream<TBuilder extends { add(source: IConfigSource): TBuilder; }>(
    builder: TBuilder,
    stream: StreamPayload,
  ): TBuilder {
    return builder.add(new JsonStreamConfigSource(stream));
  },
} satisfies AugmentationSet<ConfigBuilder<unknown>>;

registerAugmentations(nameof<IConfigBuilder>(), JsonConfigExtensions);

export { JsonConfigProvider } from './JsonConfigProvider';
export { JsonConfigSource } from './JsonConfigSource';
export type { JsonConfigSourceOptions } from './JsonConfigSource';
export { JsonStreamConfigProvider } from './JsonStreamConfigProvider';
export { JsonStreamConfigSource } from './JsonStreamConfigSource';
