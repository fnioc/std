// Public entry point for @rhombus-std/config.core -- the PURE-TYPES configuration
// abstractions substrate.
//
// Ships ZERO runtime values: only the IConfig* interfaces and the
// ITryGetResult tuple type. Engine consumers (@rhombus-std/config) and provider
// packages depend on these via `import type` without pulling any runtime.

export type * from './IConfig';
export type * from './IConfigBuilder';
export type * from './IConfigManager';
export type * from './IConfigProvider';
export type * from './IConfigRoot';
export type * from './IConfigSection';
export type * from './IConfigSource';
export type * from './types';
