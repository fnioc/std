// @rhombus-std/di — the ioc runtime engine.
//
// Consumes the plain-data ABI emitted by @rhombus-std/di.transformer (or hand-fed via
// @rhombus-std/di.core's authoring surfaces) and resolves the dependency graph. Never
// touches a TypeScript type — works purely on string tokens and the positional
// DepRecord signatures in the global-symbol Map.
//
// Phase 2A scope: registration, the scope chain + scoped lifetimes, resolution
// (a tag whose frame is not open resolves transiently), greedy signature
// selection, cycle detection, the useFactory/useValue registration shapes, and
// native disposal.
//
// Phase 2D.2 adds factory injection (a ctor param typed `() => IFoo` becomes an
// injected callable) and caller-supplied parameter support via the FactoryRef
// params list.
//
// Container redesign: `Scope` is now a pure frame (cache + disposal + parent
// link), and `ServiceProvider` is the public container surface implementing
// `Resolver` + `ScopeFactory` + Disposable.

export { ServiceManifest, ServiceManifestClass } from "./builder.js";
export type { ServiceManifestCtor } from "./builder.js";

// The authoring TYPE-machinery lives in the pure-types @rhombus-std/di.core package (the
// abstractions surface a library author depends on). Re-exported here so a di
// consumer reaches the whole authoring surface through the single @rhombus-std/di
// import, exactly as before the split.
export type { AddBuilder, ServiceManifestBase } from "@rhombus-std/di.core";

// The concrete container impl. Consumers hold the `ServiceProvider` INTERFACE
// (re-exported from types.js below); the class is exported for white-box use
// (tests, advanced wiring) — never as the consumer-facing provider type.
export { Scope, ServiceProviderClass } from "./scope.js";

export type {
  ClassRegistration,
  Ctor,
  Factory,
  FactoryRegistration,
  Lifetime,
  OpenRegistration,
  Registration,
  Resolver,
  // Backwards-compat alias.
  ResolveScope,
  ScopeFactory,
  // The public provider surface — the abstractions interface (di.core), not the
  // impl class. What `build()` / `createScope()` return.
  ServiceProvider,
  ValueRegistration,
} from "./types.js";

export {
  AsyncDisposalRequiredError,
  AsyncResolutionRequiredError,
  CircularDependencyError,
  DiError,
  FactoryTargetError,
  MissingMetadataError,
  NoSatisfiableSignatureError,
  NoSatisfiableUnionError,
  OpenTokenRegistrationError,
  OpenTokenResolutionError,
  UnregisteredTokenError,
} from "./errors.js";

// The slot/token RUNTIME helpers now live in di's own source (relocated from the
// pure-types @rhombus-std/di.core). di re-exports them for one-import authoring ergonomics
// — a di consumer reaches the slot builders (`union`/`typeArg`), the DepSlot type
// guards, and the token-grammar helpers from here. A core-only library author
// authors the same slot shapes as plain data literals instead.
export { isFactoryRef, isLiteralRef, isScopeRef, isTypeArgRef, isUnionSlot } from "./guards.js";
export { typeArg, union } from "./slots.js";
export { closeToken, isOpenToken, parseToken, substituteSignatures, substituteToken } from "./tokens.js";

// The ABI TYPES stay in @rhombus-std/di.core (pure types); di re-exports them so the whole
// surface is reachable through one @rhombus-std/di import.
export type {
  $,
  DepRecord,
  DepSlot,
  Hole,
  Inject,
  ParsedToken,
  Token,
  TypeArgRef,
  Typeof,
  Union,
} from "@rhombus-std/di.core";
