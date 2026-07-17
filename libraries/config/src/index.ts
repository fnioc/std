// Public entry point for @rhombus-std/config -- the layered configuration engine.
//
// Exports the abstractions (IConfig* interfaces + the configPath
// helpers), the engine classes (ConfigBuilder / ConfigRoot /
// ConfigSection / the abstract ConfigProvider base) +
// compareConfigKeys, the bundled Memory provider + its
// addInMemoryCollection augmentation, and the runtime schema surface
// (Schema/Infer/OPTIONAL + the coercing build path). Provider packages
// (@rhombus-std/config.json/-env/-commandline) peer-depend on this package, extend
// ConfigProvider, implement IConfigSource, and augment
// ConfigBuilder with their own add* sugar.

// The abstraction types (IConfig/-Builder/-Root/-Section/-Source/
// -Provider/-Manager + ITryGetResult) now live in @rhombus-std/config.core. Re-export
// them so consumers importing them from @rhombus-std/config keep working --
// config's public surface stays a superset of core's.
export type * from '@rhombus-std/config.core';

// The runtime `configPath` helper namespace stays in this package.
export * as configPath from './abstractions/config-path';

// Abstraction helpers. The public MECA convenience augmentations over the core
// IConfig* interfaces -- runtime, so they live here rather than in
// config.core (which ships zero runtime values). Importing this module installs
// their fluent forms (CLOSED sets, docs §38); the exported consts are the
// standalone member surface, and `exists` stays a plain free function.
export { ConfigExtensions, exists } from './ConfigExtensions';
export { type ConfigDebugViewContext, ConfigRootExtensions } from './ConfigRootExtensions';

// Engine.
export { compareConfigKeys } from './config-key-comparer';
export { ConfigBuilder } from './ConfigBuilder';
export { ConfigManager } from './ConfigManager';
export { ConfigProvider } from './ConfigProvider';
export { ConfigReloadToken } from './ConfigReloadToken';
export { ConfigRoot } from './ConfigRoot';
export { ConfigSection } from './ConfigSection';

// Memory provider. The re-export is side-effectful: importing this module
// registers the `addInMemoryCollection` augmentation against the shared
// IConfigBuilder token (docs §38), reaching both decorated builders.
export * from './memory';

// Chained provider. Side-effectful re-export: registers the `addConfig`
// augmentation against the same IConfigBuilder token, wrapping an
// already-built IConfig as a live source.
export * from './chained';

// Stream provider bases -- the abstract Source/Provider pair stream-shaped
// provider packages (e.g. @rhombus-std/config.json's addJsonStream) extend.
export * from './stream';

// Runtime coercion + schema. `withType` (Tier 2) is intentionally NOT
// re-exported here -- it's opt-in via `import "@rhombus-std/config/with-type-augment"`.
export { SchemaCoercionError } from './coerce';
export { OPTIONAL } from './schema';
export type { Infer, ObjectSchema, OptionalSchema, Schema } from './schema';

// ConfigObject + IndexedSection flow through `export type * from "@rhombus-std/config.core"` above.
