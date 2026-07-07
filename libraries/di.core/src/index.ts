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

export type { AddBuilder, ServiceManifestBase } from "./authoring.js";

// The concrete registration builder plus the public authoring interface it is
// bound to. The class is a runtime value; augmentations prototype-patch it.
export { ServiceManifestClass } from "./service-manifest.js";
export type { ServiceManifest } from "./service-manifest.js";

export type { Ctor, Factory, OpenRegistration, Producer, Registration, SealedManifest } from "./registrations.js";

export type { Lifetime, Resolver, ResolveScope, ScopeFactory, ServiceProvider } from "./provider.js";

// The slot/token ABI runtime helpers. A di consumer reaches these through the
// re-export in `@rhombus-std/di`; a core-only author authors the same shapes as
// plain data literals.
export { isFactoryRef, isLiteralRef, isScopeRef, isTypeArgRef, isUnionSlot } from "./guards.js";
export { typeArg, union } from "./slots.js";
export { closeToken, isOpenToken, parseToken, substituteSignatures, substituteToken } from "./tokens.js";

// The registration-time error taxonomy root and the open-token registration
// error. Resolution-time errors extend `DiError` from `@rhombus-std/di`.
export { DiError, OpenTokenRegistrationError } from "./errors.js";
