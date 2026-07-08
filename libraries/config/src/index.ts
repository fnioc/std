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
export type * from "@rhombus-std/config.core";

// The runtime `configPath` helper namespace stays in this package.
export * as configPath from "./abstractions/configuration-path";

// Abstraction helpers. The public MECA convenience functions over the core
// IConfiguration* interfaces -- runtime, so they live here rather than in
// config.core (which ships zero runtime values).
export { asEnumerable, exists, getConnectionString, getRequiredSection } from "./configuration-extensions";
export { type ConfigurationDebugViewContext, getDebugView } from "./configuration-root-extensions";

// Engine.
export { ConfigurationBuilder } from "./configuration-builder";
export { compareConfigurationKeys } from "./configuration-key-comparer";
export { ConfigurationProvider } from "./configuration-provider";
export { ConfigurationReloadToken } from "./configuration-reload-token";
export { ConfigurationRoot } from "./configuration-root";
export { ConfigurationSection } from "./configuration-section";

// Memory provider. The re-export is side-effectful: importing this module
// installs the `addInMemoryCollection` prototype method + declaration merge
// onto ConfigurationBuilder.
export * from "./memory";

// Runtime coercion + schema. `withType` (Tier 2) is intentionally NOT
// re-exported here -- it's opt-in via `import "@rhombus-std/config/with-type-augment"`.
export { SchemaCoercionError } from "./coerce";
export { OPTIONAL } from "./schema";
export type { Infer, ObjectSchema, OptionalSchema, Schema } from "./schema";

// ConfigObject + IndexedSection flow through `export type * from "@rhombus-std/config.core"` above.
