// Public entry point for @rhombus-std/config -- the layered configuration engine.
//
// Exports the abstractions (IConfig* interfaces + the configPath
// helpers), the engine classes (ConfigBuilder / ConfigRoot /
// ConfigSection / the abstract ConfigProvider base) +
// compareConfigKeys, the bundled Memory provider + its
// addInMemoryCollection augmentation, and the coercing build path a
// `Type`-tree schema drives. Provider packages
// (@rhombus-std/config.json/-env/-commandline) peer-depend on this package, extend
// ConfigProvider, implement IConfigSource, and augment
// ConfigBuilder with their own add* sugar.

// The configuration abstractions (IConfig/-Builder/-Root/-Section/-Source/
// -Provider/-Manager + ITryGetResult, the `configPath` helpers, the
// `ConfigAugmentations`/`ConfigRootAugmentations` convenience sets + `exists`,
// and the `isConfigSection` runtime discriminant) live in
// @rhombus-std/config.core. Re-export the WHOLE surface (types AND values)
// so consumers importing any of it from @rhombus-std/config keep working;
// config's public surface stays a superset of core's.
export * from '@rhombus-std/config.core';

// Engine.
export * from './config-key-comparer';
export * from './ConfigBuilder';
export * from './ConfigManager';
export * from './ConfigProvider';
export * from './ConfigReloadToken';
export * from './ConfigRoot';
export { ConfigSection } from './ConfigSection';

// Memory provider. The re-export is side-effectful: importing this module
// registers the `addInMemoryCollection` augmentation against the shared
// IConfigBuilder token, reaching both decorated builders.
export * from './memory';

// Chained provider. Side-effectful re-export: registers the `addConfig`
// augmentation against the same IConfigBuilder token, wrapping an
// already-built IConfig as a live source.
export * from './chained';

// Stream provider bases -- the abstract Source/Provider pair stream-shaped
// provider packages (e.g. @rhombus-std/config.json's addJsonStream) extend.
export * from './stream';

// Runtime coercion. `withType` is not here: it is typed and lowered by
// @rhombus-std/config.extras, so depending on that package is what puts the
// member on `ConfigBuilder`.
export { SchemaCoercionError } from './coerce';

// ConfigObject + IndexedSection flow through `export * from "@rhombus-std/config.core"` above.
