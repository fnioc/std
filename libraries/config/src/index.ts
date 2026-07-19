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

// The configuration abstractions (IConfig/-Builder/-Root/-Section/-Source/
// -Provider/-Manager + ITryGetResult, the `configPath` helpers, the
// `ConfigAugmentations`/`ConfigRootAugmentations` convenience sets + `exists`,
// and the `isConfigSection` runtime discriminant) live in
// @rhombus-std/config.core -- the assembly mirroring the reference
// `.Configuration.Abstractions`. Re-export the WHOLE surface (types AND values)
// so consumers importing any of it from @rhombus-std/config keep working;
// config's public surface stays a superset of core's.
export * from '@rhombus-std/config.core';

// Install the convenience augmentations' fluent forms onto the concrete engine
// classes (CLOSED sets, docs §38). The member sets themselves are re-exported
// from core by the `export *` above; these side-effect imports run the
// `applyAugmentations` calls and carry the `declare module` merges.
import './config-augmentations-install';
import './config-root-augmentations-install';

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

// ConfigObject + IndexedSection flow through `export * from "@rhombus-std/config.core"` above.
