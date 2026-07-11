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

// The registration builder now lives in @rhombus-std/di.core (the abstractions
// package ships the concrete collection). di re-exports the class, supplies the
// constructible `ServiceManifest` value + its ctor type, and — via importing
// ./service-manifest.js — PROTOTYPE-PATCHES the engine-constructing half of
// `build()` onto the class as a load-time side effect.
export { ServiceManifestClass } from "@rhombus-std/di.core";
export { ServiceManifest } from "./service-manifest.js";
export type { ServiceManifestCtor } from "./service-manifest.js";
// The `build()` augmentation const (mirrors the reference
// `ServiceCollectionContainerBuilderExtensions`) — the standalone call surface;
// importing it here also runs its registry registration side effect.
export { ServiceCollectionContainerBuilderExtensions } from "./service-manifest.js";

// The authoring TYPE-machinery lives in @rhombus-std/di.core alongside the builder.
// Re-exported here so a di consumer reaches the whole authoring surface through
// the single @rhombus-std/di import, exactly as before the split.
export type { AddBuilder, ServiceManifestBase } from "@rhombus-std/di.core";

// The concrete container impl. Consumers hold the `ServiceProvider` INTERFACE
// (re-exported from types.js below); the class is exported for white-box use
// (tests, advanced wiring) — never as the consumer-facing provider type.
//
// The internal `Scope` frame (cache + disposal + parent link) is deliberately NOT
// exported: it is a pure implementation type, not public surface. A consumer sees
// only the `ServiceProvider` interface a scope frame backs (#24).
export { ServiceProviderClass } from "./ServiceProviderClass.js";

export type {
  Ctor,
  Factory,
  Lifetime,
  OpenRegistration,
  Producer,
  Registration,
  // The named reference capability analogs Resolver composes.
  RequiredResolver,
  Resolver,
  // Backwards-compat alias.
  ResolveScope,
  ScopeFactory,
  // The public provider surface — the abstractions interface (di.core), not the
  // impl class. What `build()` / `createScope()` return.
  ServiceProvider,
  // The pluggable provider-factory seam (reference `IServiceProviderFactory`).
  ServiceProviderFactory,
  // The provider-construction options `build(options?)` accepts (the reference
  // `ServiceProviderOptions` analog): `validateScopes` / `validateOnBuild`.
  ServiceProviderOptions,
  ServiceQuery,
} from "./types.js";

export {
  ActivationError,
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
  RegistrationValidationError,
  ScopeValidationError,
  UnregisteredTokenError,
} from "./errors.js";

// The slot/token RUNTIME helpers live in @rhombus-std/di.core (its slot/token
// ABI). di re-exports them for one-import authoring ergonomics — a di consumer
// reaches the slot builders (`union`/`typeArg`), the DepSlot type guards, and the
// token-grammar helpers from here. A core-only library author authors the same
// slot shapes as plain data literals instead.
export { isFactoryRef, isLiteralRef, isTypeArgRef, isUnionSlot } from "@rhombus-std/di.core";
export { typeArg, union } from "@rhombus-std/di.core";
export { closeToken, isOpenToken, parseToken, substituteSignatures, substituteToken } from "@rhombus-std/di.core";
// The intrinsic provider token — a `Resolver`-typed param derives it, and the
// engine resolves it to the live provider view.
export { isProviderToken, RESOLVER_TOKEN } from "@rhombus-std/di.core";

// The activator helper + the null-object provider — authored in di.core, re-exported
// for one-import reach (a di consumer expects `ActivatorUtilities` /
// `EmptyServiceProvider` from the runtime package, as in the reference DI namespace).
export { ActivatorUtilities, EmptyServiceProvider } from "@rhombus-std/di.core";
export type { ObjectFactory } from "@rhombus-std/di.core";

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
