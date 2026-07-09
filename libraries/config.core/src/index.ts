// Public entry point for @rhombus-std/config.core -- the PURE-TYPES configuration
// abstractions substrate.
//
// Ships ZERO runtime values: only the IConfiguration* interfaces and the
// ITryGetResult tuple type. Engine consumers (@rhombus-std/config) and provider
// packages depend on these via `import type` without pulling any runtime.

export type * from "./configuration";
export type * from "./configuration-builder";
export type * from "./configuration-manager";
export type * from "./configuration-provider";
export type * from "./configuration-root";
export type * from "./configuration-section";
export type * from "./configuration-source";
export type * from "./types";
