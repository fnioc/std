/**
 * @rhombus-std/di.core — the ioc ABSTRACTIONS substrate.
 *
 * A LIBRARY AUTHOR depends on this package to author registrations and
 * dependency signatures WITHOUT pulling the `@rhombus-std/di` resolution engine.
 * It carries the dependency-signature data format, the slot/token type surface
 * and its grammar/guard/constructor helpers, the registration ABI, and — mirror
 * of the reference DI split where the abstractions package ships the concrete
 * registration collection — the concrete registration builder `ServiceManifestClass`
 * (collects `addClass`/`addFactory`/`addValue`; `build()` is a `@rhombus-std/di`
 * extension). Cross-package fluent-authoring augmentations prototype-patch this
 * class, and depend on di.core ALONE, never the runtime.
 *
 * Runtime footprint: the slot/token helpers, the registration builder, and the
 * registration-time errors (`DiError` base, `OpenTokenRegistrationError`). The
 * resolution engine (`ServiceProviderClass`) and resolution-time errors live in
 * `@rhombus-std/di`.
 */

export type { DepSignatures, DepSlot, DepTarget, FactoryRef, LiteralRef, ParsedToken, Token, TypeArgRef,
  Union } from './types.js';

// The compile-time authoring brands (`Inject`, `Hole`, `$`, `Typeof`), plus
// the pre-instantiated `$1`…`$9` bare-hole aliases.
export type { $, $1, $2, $3, $4, $5, $6, $7, $8, $9, Hole, Inject, Keyed, Typeof } from './brands.js';

// The authoring surface: the collection interface plus the `AddChain` slot
// algebra a registration call returns (`Slot` + the four modifier faces).
export type { AddChain, IAsBuilder, IServiceManifestBase, IServiceManifestHolder, IWithKeyBuilder,
  IWithSignatureBuilder, IWithSignaturesBuilder, Slot } from './authoring.js';

// The concrete registration builder plus the public authoring interface it is
// bound to. The class is a runtime value; augmentations prototype-patch it.
export { ServiceManifestClass } from './IServiceManifest.js';
export type { IServiceManifest } from './IServiceManifest.js';

export type { Ctor, Factory, ManifestEntry, OpenRegistration, Producer, Registration } from './registrations.js';

export type { IRequiredResolver, IResolver, IResolveScope, IScopeFactory, IServiceProvider, IServiceQuery,
  Lifetime } from './provider.js';

// The pluggable provider-factory seam (the reference `IServiceProviderFactory`
// analog). A single-container no-op here, but named so hosting shares one type.
export type { IServiceProviderFactory } from './IServiceProviderFactory.js';

// The provider-construction options `build(options?)` accepts (the reference
// `ServiceProviderOptions` analog) — pure data; the engine reads the flags.
export type { ServiceProviderOptions } from './ServiceProviderOptions.js';

// The slot/token ABI runtime helpers. A di consumer reaches these through the
// re-export in `@rhombus-std/di`; a core-only author authors the same shapes as
// plain data literals.
export { isFactoryRef, isLiteralRef, isTypeArgRef, isUnionSlot } from './guards.js';
export { typeArg, union } from './slots.js';

// The unified token/slot expression tree — ONE plain-data `TokenNode` tree every
// token op walks (`@rhombus-std/di` consumes it to close open registrations). A
// token STRING is the wire identity; `TokenNode` is its transient parsed view.
// The `TokenNode.*` companion carries the pure ops (parse / tryParse / toString /
// canonicalise / baseKey / isOpen); the visitor CLASSES carry the mutating/query
// ops. `closeToken`/`isOpenToken`/`parseToken` are the shallow string-grammar
// classification/compose edge. Partial closing / most-specific-wins live in the
// `TokenProvider` reference but are GATED at the engine (see `token/`).
export type { ConcreteNode, FactoryNode, HoleNode, LiteralNode, ProviderNode, UnionNode } from './token/index.js';
export { TokenNode } from './token/index.js';
export { Matcher, Specificity, Substituter, TokenRewriter, TokenWalker, Validator } from './token/index.js';
export { blowUpSignatures, closeSignatures, parseSlot, serialiseSlot } from './token/index.js';
export { closeToken, isOpenToken, parseToken } from './token/index.js';

// The intrinsic provider token — a `IResolver`-typed parameter derives it, and
// the engine resolves it to the live provider view (see `provider-token.ts`).
export { isProviderToken, RESOLVER_TOKEN } from './provider-token.js';

// The shared null-object provider singleton (the reference `EmptyServiceProvider`
// analog) — a `IServiceProvider` with no application services.
export { EmptyServiceProvider } from './EmptyServiceProvider.js';

// `ActivatorUtilities` — activate an UNREGISTERED class against a provider,
// injecting its dependency-signature slots. The reference activator-helper analog.
export { ActivatorUtilities } from './ActivatorUtilities.js';
export type { ObjectFactory } from './ActivatorUtilities.js';

// The registration-time error taxonomy root, the open-token registration error,
// and the activation error `ActivatorUtilities` raises. Resolution-time errors
// extend `DiError` from `@rhombus-std/di`.
export { ActivationError, DiError, OpenTokenRegistrationError } from './errors.js';

// The descriptor-level mutation augmentation (`removeAll`, `tryAdd*`, `replace*`).
// A side-effect import: pulling the barrel registers it against the
// `ServiceManifest` token so the verbs are installed onto the collection prototype
// (§28/§38). The const is the standalone call surface.
export { ServiceManifestDescriptorAugmentations } from './augmentations/ServiceManifestDescriptorAugmentations.js';
