// @rhombus-std/di — the ioc runtime engine.
//
// Consumes the plain-data ABI emitted by @rhombus-std/di.extras (or hand-fed via
// @rhombus-std/di.core's authoring surfaces) and resolves the dependency graph. Never
// touches a TypeScript type — works purely on string tokens and the positional
// dependency signatures in the global-symbol Map.
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
// link), and `IServiceProvider` is the public container surface implementing
// `IResolver` + `IScopeFactory` + Disposable.

// The registration builder now lives in @rhombus-std/di.core (the abstractions
// package ships the concrete collection). di re-exports the class, supplies the
// constructible `ServiceManifest` value + its ctor type, and — via importing
// ./ServiceManifest.js — PROTOTYPE-PATCHES the engine-constructing half of
// `build()` onto the class as a load-time side effect.
export { ServiceManifestClass } from '@rhombus-std/di.core';
export { ServiceManifest } from './ServiceManifest.js';
export type { IServiceManifest, ServiceManifestCtor } from './ServiceManifest.js';
// The `build()` augmentation const (mirrors the reference container-builder
// extension static class) — the standalone call surface; importing it here also
// runs its registry registration side effect.
export { ServiceManifestContainerBuilderAugmentations } from './ServiceManifest.js';

// The authoring TYPE-machinery lives in @rhombus-std/di.core alongside the builder.
// Re-exported here so a di consumer reaches the whole authoring surface through
// the single @rhombus-std/di import, exactly as before the split.
// `AddChain<S, Slots, Gated>` is the immutable registration continuation a call to
// `addClass`/`addFactory` returns: the manifest itself (withheld while gated), plus
// whichever modifier faces (`withSignature`/`withSignatures`/`as`/`withKey`) the
// call has not already filled positionally.
export type { AddChain, IAsBuilder, IServiceManifestBase, IServiceManifestHolder, IWithKeyBuilder,
  IWithSignatureBuilder, IWithSignaturesBuilder, Slot } from '@rhombus-std/di.core';

// The concrete container impl. Consumers hold the `IServiceProvider` INTERFACE
// (re-exported from types.js below); the class is exported for white-box use
// (tests, advanced wiring) — never as the consumer-facing provider type.
//
// The internal `Scope` frame (cache + disposal + parent link) is deliberately NOT
// exported: it is a pure implementation type, not public surface. A consumer sees
// only the `IServiceProvider` interface a scope frame backs (#24).
export { ServiceProviderClass } from './ServiceProviderClass.js';

export type {
  Ctor,
  Factory,
  // The named reference capability analogs IResolver composes.
  IRequiredResolver,
  IResolver,
  IScopeFactory,
  // The public provider surface — the abstractions interface (di.core), not the
  // impl class. What `build()` / `createScope()` return.
  IServiceProvider,
  // The pluggable provider-factory seam (reference `IServiceProviderFactory`).
  IServiceProviderFactory,
  IServiceQuery,
  Lifetime,
  ManifestEntry,
  OpenRegistration,
  Producer,
  Registration,
  // The provider-construction options `build(options?)` accepts (the reference
  // `ServiceProviderOptions` analog): `validateScopes` / `validateOnBuild`.
  ServiceProviderOptions,
} from './types.js';

// The WHOLE error taxonomy lives in @rhombus-std/di.core — a library that
// references only the abstractions has to be able to classify what a caller's
// container threw at it. di re-exports it so the taxonomy stays reachable
// through one @rhombus-std/di import, and — because di keeps di.core external in
// its bundle — both imports name the SAME class object, so `instanceof` holds
// across the seam (§130).
export { AsyncDisposalRequiredError, AsyncResolutionRequiredError, CircularDependencyError, DiError, FactoryTargetError,
  MissingMetadataError, NoSatisfiableSignatureError, NoSatisfiableUnionError, OpenTokenRegistrationError,
  OpenTokenResolutionError, ProviderDisposedError, RegistrationValidationError, ScopeValidationError,
  UnregisteredTokenError } from '@rhombus-std/di.core';

// The slot/token RUNTIME helpers live in @rhombus-std/di.core (its slot/token
// ABI). di re-exports them for one-import authoring ergonomics — a di consumer
// reaches the slot builders (`union`/`typeArg`), the DepSlot type guards, and the
// token-grammar helpers from here. A core-only library author authors the same
// slot shapes as plain data literals instead.
export { isFactoryRef, isLiteralRef, isTypeArgRef, isUnionSlot } from '@rhombus-std/di.core';
export { typeArg, union } from '@rhombus-std/di.core';
export { closeToken, isOpenToken, parseToken, unkeyedToken } from '@rhombus-std/di.core';
// The intrinsic provider token — a `IResolver`-typed param derives it, and the
// engine resolves it to the live provider view.
export { isProviderToken, RESOLVER_TOKEN } from '@rhombus-std/di.core';

// The null-object provider — authored in di.core, re-exported for one-import
// reach (a di consumer expects `EmptyServiceProvider` from the runtime package,
// as in the reference DI namespace).
export { EmptyServiceProvider } from '@rhombus-std/di.core';

// The ABI TYPES stay in @rhombus-std/di.core (pure types); di re-exports them so the whole
// surface is reachable through one @rhombus-std/di import.
// The authoring BRANDS (`$`/`Hole`/`Inject`/`Typeof`) come through in full: the
// pre-instantiated bare hole aliases `$1`…`$9` are re-exported alongside the
// generic `$<N>` they abbreviate. A shorthand di.core offers but this barrel
// withholds is a shorthand no consumer can reach.
export type { $, $1, $2, $3, $4, $5, $6, $7, $8, $9, DepSignatures, DepSlot, Hole, Inject, ParsedToken, Token,
  TypeArgRef, Typeof, Union } from '@rhombus-std/di.core';
