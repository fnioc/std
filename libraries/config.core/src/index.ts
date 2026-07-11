// Public entry point for @rhombus-std/config.core -- the PURE-TYPES configuration
// abstractions substrate.
//
// Ships ZERO runtime values: only the IConfiguration* interfaces and the
// ITryGetResult tuple type. Engine consumers (@rhombus-std/config) and provider
// packages depend on these via `import type` without pulling any runtime.

export type * from './IConfiguration';
export type * from './IConfigurationBuilder';
export type * from './IConfigurationManager';
export type * from './IConfigurationProvider';
export type * from './IConfigurationRoot';
export type * from './IConfigurationSection';
export type * from './IConfigurationSource';
export type * from './types';
