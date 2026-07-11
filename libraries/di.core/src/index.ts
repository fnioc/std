/**
 * @rhombus-std/di.core — the ioc ABSTRACTIONS substrate.
 *
 * A LIBRARY AUTHOR depends on this package to author registrations and
 * dependency signatures WITHOUT pulling the `@rhombus-std/di` resolution engine.
 * It carries the dependency-signature data format, the slot/token type surface
 * and its grammar/guard/constructor helpers, the registration ABI, and — mirror
 * of the reference DI split where the abstractions package ships the concrete
 * `ServiceCollection` — the concrete registration builder `ServiceManifestClass`
 * (collects `add`/`addFactory`/`addValue`; `build()` is a `@rhombus-std/di`
 * extension). Cross-package fluent-authoring augmentations prototype-patch this
 * class, and depend on di.core ALONE, never the runtime.
 *
 * Runtime footprint: the slot/token helpers, the registration builder, and the
 * registration-time errors (`DiError` base, `OpenTokenRegistrationError`). The
 * resolution engine (`ServiceProviderClass`) and resolution-time errors live in
 * `@rhombus-std/di`.
 */

export type { DepRecord, DepSlot, FactoryRef, LiteralRef, ParsedToken, Token, TypeArgRef, Union } from './types.js';

// The compile-time authoring brands (`Inject`, `Hole`, `$`, `Typeof`).
export type { $, Hole, Inject, Typeof } from './brands.js';

// The overload-faithful `Parameters<T>` / `ConstructorParameters<T>` analogs.
export type { OverloadedConstructorParameters, OverloadedParameters } from './overloads.js';

export type { AddBuilder, ServiceManifestBase } from './authoring.js';

// The concrete registration builder plus the public authoring interface it is
// bound to. The class is a runtime value; augmentations prototype-patch it.
export { ServiceManifestClass } from './service-manifest.js';
export type { ServiceManifest } from './service-manifest.js';

export type { Ctor, Factory, OpenRegistration, Producer, Registration } from './registrations.js';

export type { Lifetime, RequiredResolver, Resolver, ResolveScope, ScopeFactory, ServiceProvider,
  ServiceQuery } from './provider.js';

// The pluggable provider-factory seam (the reference `IServiceProviderFactory`
// analog). A single-container no-op here, but named so hosting shares one type.
export type { ServiceProviderFactory } from './ServiceProviderFactory.js';

// The provider-construction options `build(options?)` accepts (the reference
// `ServiceProviderOptions` analog) — pure data; the engine reads the flags.
export type { ServiceProviderOptions } from './service-provider-options.js';

// The slot/token ABI runtime helpers. A di consumer reaches these through the
// re-export in `@rhombus-std/di`; a core-only author authors the same shapes as
// plain data literals.
export { isFactoryRef, isLiteralRef, isTypeArgRef, isUnionSlot } from './guards.js';
export { typeArg, union } from './slots.js';
export { closeToken, isOpenToken, parseToken, substituteSignatures, substituteToken } from './tokens.js';

// The intrinsic provider token — a `Resolver`-typed parameter derives it, and
// the engine resolves it to the live provider view (see `provider-token.ts`).
export { isProviderToken, RESOLVER_TOKEN } from './provider-token.js';

// The shared null-object provider singleton (the reference `EmptyServiceProvider`
// analog) — a `ServiceProvider` with no application services.
export { EmptyServiceProvider } from './empty-service-provider.js';

// `ActivatorUtilities` — activate an UNREGISTERED class against a provider,
// injecting its dependency-signature slots. The reference activator-helper analog.
export { ActivatorUtilities } from './activator-utilities.js';
export type { ObjectFactory } from './activator-utilities.js';

// The registration-time error taxonomy root, the open-token registration error,
// and the activation error `ActivatorUtilities` raises. Resolution-time errors
// extend `DiError` from `@rhombus-std/di`.
export { ActivationError, DiError, OpenTokenRegistrationError } from './errors.js';

// The descriptor-level mutation augmentation (`removeAll`). A side-effect import:
// pulling the barrel registers it against the `ServiceManifest` token so the verb
// is installed onto the collection prototype (§28/§38). The const is the
// standalone call surface.
export { ServiceCollectionDescriptorExtensions } from './extensions/service-collection-descriptor-augmentations.js';
