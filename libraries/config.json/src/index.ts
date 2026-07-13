// Public entry point for @rhombus-std/config.json.
//
// Exports JsonConfigurationSource/JsonConfigurationProvider (+ the
// JsonStream* pair for in-memory payloads) and installs the `addJsonFile` /
// `addJsonStream` sugar onto `@rhombus-std/config`'s ConfigurationBuilder AND
// ConfigurationManager via the augmentation registry (TS declaration merging +
// a `registerAugmentations` call against the shared IConfigurationBuilder
// token) -- the reference extension methods target IConfigurationBuilder, which
// ConfigurationManager implements too. Both concrete builders are decorated
// with that one token, so a single registration reaches BOTH, and
// `manager.addJsonFile(...)` works the same way `builder.addJsonFile(...)` does.
//
// A consumer who never names a runtime symbol from this package (only wants
// the sugar) needs a bare side-effect import: `import "@rhombus-std/config.json";`.
// This package must NOT set `"sideEffects": false` in package.json (would
// let a bundler tree-shake the augmentation away).

import type { ConfigurationBuilder, StreamPayload } from '@rhombus-std/config';
import type { IConfigurationBuilder, IConfigurationSource, IndexedSection } from '@rhombus-std/config.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import { JsonConfigurationSource, type JsonConfigurationSourceOptions } from './json-configuration-source';
import { JsonStreamConfigurationSource } from './JsonStreamConfigurationSource';

// Augmenting the barrel ("@rhombus-std/config"). Config is dist-referenced, so
// providers typecheck against its rolled, flat dist/index.d.ts, where
// ConfigurationBuilder is declared directly (no re-export chain) -- a
// declare-module merge onto the barrel lands on the same class the barrel
// exposes, even with 2+ provider augmentations in one program. (Pre-#199 this
// had to target a `./configuration-builder` subpath: providers then saw
// config's src barrel, which re-exports the class, and a re-exported class
// won't declaration-merge -- 2+ augmenters split it into phantom types.)
declare module '@rhombus-std/config' {
  // Generic arity + default MUST match the class (TS2428) -- `<T =
  // IndexedSection>`, same IndexedSection imported from @rhombus-std/config.core.
  interface ConfigurationBuilder<T = IndexedSection> {
    /** Registers a {@link JsonConfigurationSource} reading `path` (resolved against `process.cwd()`). */
    addJsonFile(path: string, opts?: JsonConfigurationSourceOptions): this;
    /** Registers a {@link JsonStreamConfigurationSource} reading the in-memory `stream` payload. */
    addJsonStream(stream: StreamPayload): this;
  }
}

// Same barrel merge for ConfigurationManager -- see the builder note above.
// ConfigurationManager has no generic type parameter, so no TS2428 arity concern.
declare module '@rhombus-std/config' {
  interface ConfigurationManager {
    /** Registers a {@link JsonConfigurationSource} reading `path` (resolved against `process.cwd()`). */
    addJsonFile(path: string, opts?: JsonConfigurationSourceOptions): this;
    /** Registers a {@link JsonStreamConfigurationSource} reading the in-memory `stream` payload. */
    addJsonStream(stream: StreamPayload): this;
  }
}

// One named object literal mirroring the reference `JsonConfigurationExtensions`
// static class (docs §28/§38): its members are the class's static methods,
// receiver-first. Registered against the shared IConfigurationBuilder token
// (the primary path -- both decorated builders receive it) AND exported so the
// member is the standalone form. `TBuilder` is bounded by "has an add() that
// returns itself" rather than pinned to ConfigurationBuilder<T> -- see
// @rhombus-std/config's memory/index.ts for the full rationale -- so this one
// object literal satisfies `AugmentationSet` for both classes while
// preserving each receiver's own concrete return type.
export const JsonConfigurationExtensions = {
  addJsonFile<TBuilder extends { add(source: IConfigurationSource): TBuilder; }>(
    builder: TBuilder,
    path: string,
    opts?: JsonConfigurationSourceOptions,
  ): TBuilder {
    return builder.add(new JsonConfigurationSource(path, opts));
  },
  addJsonStream<TBuilder extends { add(source: IConfigurationSource): TBuilder; }>(
    builder: TBuilder,
    stream: StreamPayload,
  ): TBuilder {
    return builder.add(new JsonStreamConfigurationSource(stream));
  },
} satisfies AugmentationSet<ConfigurationBuilder<unknown>>;

registerAugmentations(nameof<IConfigurationBuilder>(), JsonConfigurationExtensions);

export { JsonConfigurationSource } from './json-configuration-source';
export type { JsonConfigurationSourceOptions } from './json-configuration-source';
export { JsonConfigurationProvider } from './JsonConfigurationProvider';
export { JsonStreamConfigurationProvider } from './JsonStreamConfigurationProvider';
export { JsonStreamConfigurationSource } from './JsonStreamConfigurationSource';
