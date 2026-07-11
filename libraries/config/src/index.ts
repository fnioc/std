// Public entry point for @rhombus-std/config -- the layered configuration engine.
//
// Exports the abstractions (IConfiguration* interfaces + the configPath
// helpers), the engine classes (ConfigurationBuilder / ConfigurationRoot /
// ConfigurationSection / the abstract ConfigurationProvider base) +
// compareConfigurationKeys, the bundled Memory provider + its
// addInMemoryCollection augmentation, and the runtime schema surface
// (Schema/Infer/OPTIONAL + the coercing build path). Provider packages
// (@rhombus-std/config.json/-env/-commandline) peer-depend on this package, extend
// ConfigurationProvider, implement IConfigurationSource, and augment
// ConfigurationBuilder with their own add* sugar.

// The abstraction types (IConfiguration/-Builder/-Root/-Section/-Source/
// -Provider/-Manager + ITryGetResult) now live in @rhombus-std/config.core. Re-export
// them so consumers importing them from @rhombus-std/config keep working --
// config's public surface stays a superset of core's.
export type * from '@rhombus-std/config.core';

// The runtime `configPath` helper namespace stays in this package.
export * as configPath from './abstractions/configuration-path';

// Abstraction helpers. The public MECA convenience augmentations over the core
// IConfiguration* interfaces -- runtime, so they live here rather than in
// config.core (which ships zero runtime values). Importing this module installs
// their fluent forms (CLOSED sets, docs §38); the exported consts are the
// standalone member surface, and `exists` stays a plain free function.
export { ConfigurationExtensions, exists } from './configuration-augmentations';
export { type ConfigurationDebugViewContext, ConfigurationRootExtensions } from './configuration-root-augmentations';

// Engine.
export { compareConfigurationKeys } from './configuration-key-comparer';
export { ConfigurationSection } from './configuration-section';
export { ConfigurationBuilder } from './ConfigurationBuilder';
export { ConfigurationManager } from './ConfigurationManager';
export { ConfigurationProvider } from './ConfigurationProvider';
export { ConfigurationReloadToken } from './ConfigurationReloadToken';
export { ConfigurationRoot } from './ConfigurationRoot';

// Memory provider. The re-export is side-effectful: importing this module
// registers the `addInMemoryCollection` augmentation against the shared
// IConfigurationBuilder token (docs §38), reaching both decorated builders.
export * from './memory';

// Chained provider. Side-effectful re-export: registers the `addConfiguration`
// augmentation against the same IConfigurationBuilder token, wrapping an
// already-built IConfiguration as a live source.
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
