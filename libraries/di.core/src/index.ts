/**
 * @rhombus-std/di.core — the PURE-TYPES abstractions substrate.
 *
 * A LIBRARY AUTHOR depends on this package (`import type`) to author
 * registrations and dependency signatures WITHOUT pulling the `@rhombus-std/di`
 * runtime. It ships ZERO runtime values — only types and the authoring type
 * machinery. The token grammar and slot constructors that used to live here
 * (`union`, `typeArg`, `parseToken`, …) are runtime and now live in `@rhombus-std/di`.
 *
 * Exports (all types):
 *   - `Token`          — string alias for a DI key
 *   - `DepSlot`        — one positional signature slot
 *   - `FactoryRef` / `ScopeRef` / `Union` / `LiteralRef` / `TypeArgRef` — slot kinds
 *   - `DepTarget` / `DepRecord` — dep-metadata shapes
 *   - `ParsedToken`    — the parse result shape for a closed-generic token
 *   - `Inject` / `Hole` / `$` / `Typeof` — compile-time authoring brands
 *   - `OverloadedParameters` / `OverloadedConstructorParameters` — overload-faithful
 *     parameter-tuple unions (every overload, not just the last)
 *   - the authoring surface: `ServiceManifest`, `ServiceManifestBase`,
 *     `AddBuilder` — `ServiceManifestCtor` (the runtime construct signature)
 *     lives in `@rhombus-std/di` instead.
 */

export type {
  $,
  DepRecord,
  DepSlot,
  DepTarget,
  FactoryRef,
  Hole,
  Inject,
  LiteralRef,
  OverloadedConstructorParameters,
  OverloadedParameters,
  ParsedToken,
  ScopeRef,
  Token,
  TypeArgRef,
  Typeof,
  Union,
} from "./types.js";

export type {
  AddBuilder,
  ServiceManifest,
  ServiceManifestBase,
} from "./authoring.js";
