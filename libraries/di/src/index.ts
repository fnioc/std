// @rhombus-std/di — the ioc runtime engine. Resolves the dependency graph from
// plain-data registrations: string tokens and positional dependency signatures.
// It never touches a TypeScript type.
//
// Most of the authoring surface (the manifest, the type machinery, the error
// taxonomy, the slot/token helpers) is defined in @rhombus-std/di.core and
// re-exported here, so a consumer reaches everything through one import.

// Importing this module is what gives the manifest a working `build()`: di.core
// ships the class with a stub that throws without the engine, and ./ServiceManifest.js
// registers the engine-constructing half onto it as a load-time side effect.
export { ServiceManifestClass } from '@rhombus-std/di.core';
export { ServiceManifestContainerBuilderAugmentations } from './ServiceManifest-ContainerBuilder-augmentations.js';
export { ServiceManifest } from './ServiceManifest.js';
export type { IServiceManifest, ServiceManifestCtor } from './ServiceManifest.js';

// `AddChain<S, Slots, Gated>` is the immutable registration continuation an
// `addClass`/`addFactory` call returns: the manifest itself (withheld while
// gated), plus whichever modifier faces (`withSignature`/`withSignatures`/`as`/
// `withKey`) the call has not already filled positionally.
export type { AddChain, IAsBuilder, IServiceManifestBase, IServiceManifestHolder, IWithKeyBuilder,
  IWithSignatureBuilder, IWithSignaturesBuilder, Slot } from '@rhombus-std/di.core';

// The concrete container impl. Consumers hold the `IServiceProvider` INTERFACE
// (re-exported from types.js below); the class is exported for white-box use
// (tests, advanced wiring) — never as the consumer-facing provider type.
export { ServiceProviderClass } from './ServiceProviderClass.js';

export type {
  Ctor,
  Factory,
  IRequiredResolver,
  IResolver,
  IScopeFactory,
  // The public provider surface — the abstractions interface, not the impl
  // class. What `build()` / `createScope()` return.
  IServiceProvider,
  // The pluggable provider-factory seam.
  IServiceProviderFactory,
  IServiceQuery,
  Lifetime,
  ManifestEntry,
  OpenRegistration,
  Producer,
  Registration,
  // The provider-construction options `build(options?)` accepts:
  // `validateScopes` / `validateOnBuild`.
  ServiceProviderOptions,
} from './types.js';

// The error taxonomy is authored in @rhombus-std/di.core so a library that
// references only the abstractions can still classify what a caller's container
// threw at it. di keeps di.core external in its bundle, so this re-export and a
// direct di.core import name the SAME class object — `instanceof` holds either way.
export { AsyncDisposalRequiredError, AsyncResolutionRequiredError, CircularDependencyError, DiError, FactoryTargetError,
  MissingMetadataError, NoSatisfiableSignatureError, NoSatisfiableUnionError, OpenTokenRegistrationError,
  OpenTokenResolutionError, ProviderDisposedError, RegistrationValidationError, ScopeValidationError,
  UnregisteredTokenError } from '@rhombus-std/di.core';

// The slot/token runtime helpers: the slot builders (`union`/`typeArg`), the
// DepSlot type guards, and the token-grammar helpers.
export { isFactoryRef, isLiteralRef, isTypeArgRef, isUnionSlot } from '@rhombus-std/di.core';
export { typeArg, union } from '@rhombus-std/di.core';
export { closeToken, isOpenToken, parseToken, unkeyedToken } from '@rhombus-std/di.core';
// The intrinsic provider token — an `IResolver`-typed param derives it, and the
// engine resolves it to the live provider view.
export { isProviderToken, RESOLVER_TOKEN } from '@rhombus-std/di.core';

export { EmptyServiceProvider } from '@rhombus-std/di.core';

export type { $, DepSignatures, DepSlot, Hole, Inject, ParsedToken, Token, TypeArgRef, Typeof,
  Union } from '@rhombus-std/di.core';
