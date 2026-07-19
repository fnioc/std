// Public entry point for @rhombus-std/config.core -- the configuration
// abstractions substrate: the assembly mirroring the reference's
// `.Configuration.Abstractions`.
//
// The IConfig* interfaces and ITryGetResult tuple type are pure types (erased
// via `import type`). Alongside them this package ships the small runtime that
// belongs to the abstractions assembly by reference parity: the `configPath`
// helpers, the `ConfigAugmentations`/`ConfigRootAugmentations` convenience
// member sets + `exists`, and the section-vs-root runtime discriminant
// (`isConfigSection`). Engine consumers (@rhombus-std/config) and provider
// packages depend on all of this; the interfaces via `import type` pull no
// runtime, the value exports pull the shared singleton bundle.

export type * from './IConfig';
export type * from './IConfigBuilder';
export type * from './IConfigManager';
export type * from './IConfigProvider';
export type * from './IConfigRoot';
export type * from './IConfigSection';
export type * from './IConfigSource';
export type * from './types';

// Runtime helpers that belong to the abstractions assembly by reference parity.
export * as configPath from './config-path';
export { configSectionBrand, isConfigSection } from './config-section-guard';
export { ConfigAugmentations, exists } from './ConfigAugmentations';
export { type ConfigDebugViewContext, ConfigRootAugmentations } from './ConfigRootAugmentations';
