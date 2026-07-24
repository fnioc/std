// The `ServiceManifestDescriptorAugmentations` augmentation -- descriptor-level
// mutation verbs on the registration builder (docs/decisions.md §28/§38). Mirrors
// the reference DI descriptor-mutation static class, an OPEN augmentation on the
// registration-collection receiver.
//
// This is an OPEN set (the `ServiceManifest` receiver is extended by many
// downstream families), so it registers against `tokenfor<IServiceManifest>()`
// through the primitives augmentation registry rather than a direct
// `applyAugmentations` at the class -- the same token every cross-package
// registration augmentation (`addOptions`, `addLogging`, `addMetrics`, ...)
// derives inline. `ServiceManifestClass` is decorated with `@augment(token)` in
// `IServiceManifest.ts`, so registering here reaches its prototype.
//
// Ported members:
//   - `removeAll(token)` -- returns a manifest with EVERY registration bound to
//     `token` dropped (the reference `RemoveAll(Type)` / `RemoveAll<T>()`; a token
//     is our service-type analog). Required by logging's `clearProviders`, which
//     strips all `ILoggerProvider` registrations.
//   - `tryAdd` / `tryAddFactory` / `tryAddValue` -- conditional registration: add
//     only when `token` has NO registration yet (the reference `TryAdd*` family).
//     When the token was ALREADY registered they return the receiver UNCHANGED --
//     which, under an immutable manifest, is exactly the right no-op: the caller
//     keeps whatever came back either way.
//   - `replace` / `replaceFactory` / `replaceValue` -- unconditional replace:
//     remove the token's existing registrations, then register anew (the
//     reference `Replace(descriptor)`).
//
// EVERY verb here returns a NEW manifest -- the manifest is immutable, so a
// discarded result is a silent no-op. Callers thread it:
// `services = services.removeAll(token)`.
//
// The class/factory verbs mirror `addClass`/`addFactory`'s POSITIONAL shape
// (`signatures` required, then optional `scope`, then optional `key`) rather than
// returning an `AddChain`: the already-registered branch has no pending
// registration to hand a modifier face for, so the two branches share the plain
// `IServiceManifest` return and the lifetime is named positionally.
//
// DIVERGENCE -- lifetime-named verbs (`TryAddTransient`/`TryAddScoped`/
// `TryAddSingleton`): the reference encodes the lifetime in the METHOD NAME
// because its lifetimes are a fixed three-value enum. std deliberately generalizes
// lifetime to arbitrary NAMED scopes, named positionally or through the fluent
// `.as(scope)` modifier (§ `ServiceManifest`): there is no `addSingleton`/
// `addScoped`/`addTransient` anywhere in the surface. Mirroring the lifetime-named
// verbs would reintroduce a naming scheme std rejects everywhere else and bake in
// scope names ("singleton"/"scoped") that need not exist in a given manifest's
// `Scopes` union. So the conditional/replace verbs stay lifetime-agnostic and take
// the scope as an argument, exactly like std's own `add`. (CLAUDE.md: prefer what
// is idiomatic for TS; the ME mirror is a weak tiebreaker.)
//
// DIVERGENCE -- there is no `ServiceDescriptor` object in std (a registration is
// authored directly via `addClass`/`addFactory`/`addValue`, never as a first-class
// descriptor value), so the reference's descriptor-taking `TryAdd(descriptor)` /
// `TryAdd(IEnumerable<descriptor>)` / `Replace(descriptor)` collapse into the
// per-kind verbs here -- the token + ctor/factory/value shapes are std's
// descriptor analog.
//
// DEFERRED -- `tryAddEnumerable`: the reference verb dedupes by
// (serviceType, implementationType), but our normalized `Registration` collapses a
// class into an opaque `produce` closure and keeps only a diagnostic `name`, so the
// implementation-type identity the dedup needs is not recoverable post-registration.
// Modeling it faithfully means carrying an implementation-identity field on
// `Registration` and threading it through the `add` path -- a deeper change than
// this conversion should smuggle in, and it has no in-tree consumer yet. Filed for
// the finalize phase (tracked against #75).

import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

// Type-only: the const references `ServiceManifestClass` solely in type position
// (the `satisfies` bound and the receiver annotation); the runtime install goes
// through the registry, not a direct `applyAugmentations(ServiceManifestClass, …)`.
import type { IServiceManifest, ServiceManifestClass } from '../IServiceManifest.js';
import type { DepSignatures, Token } from '../types.js';

// The authored verbs merge onto core's `IServiceManifestBase` interface -- the
// surface the public `ServiceManifest` a consumer holds resolves to -- AND onto
// the concrete `ServiceManifestClass`, so the class still SATISFIES
// `implements IServiceManifestBase` once the new names are on the interface.
// `Token`, `DepSignatures`, `Ctor`, `Func`, and `IServiceManifest` are named
// imports because unqualified names in a `declare module` body resolve in THIS
// file's scope. `Provider` is defaulted so each merge matches its target's
// type-parameter list (TS2428 requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
    /**
     * Returns a manifest with every registration bound to `token` (exact and
     * open) dropped. The reference `RemoveAll(Type)` / `RemoveAll<T>()` analog --
     * a `Token` is our service-type key. The receiver is unchanged; keep the
     * result.
     */
    removeAll(token: Token): IServiceManifest<Scopes>;
    /**
     * Class registration, but only when `token` has NO registration yet (the
     * reference `TryAdd*` for a type/implementation). Positional `scope` / `key`
     * exactly as on `addClass`. When the token was already registered the receiver
     * is returned UNCHANGED.
     */
    tryAdd(token: Token, ctor: Ctor, signatures: DepSignatures): IServiceManifest<Scopes>;
    tryAdd(
      token: Token,
      ctor: Ctor,
      signatures: DepSignatures,
      scope: Scopes,
    ): IServiceManifest<Scopes>;
    tryAdd(
      token: Token,
      ctor: Ctor,
      signatures: DepSignatures,
      scope: Scopes,
      key: string,
    ): IServiceManifest<Scopes>;
    /**
     * Factory registration, but only when `token` has NO registration yet (the
     * reference `TryAdd*` for a factory). Same no-op-returns-the-receiver rule.
     */
    tryAddFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures: DepSignatures,
    ): IServiceManifest<Scopes>;
    tryAddFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures: DepSignatures,
      scope: Scopes,
    ): IServiceManifest<Scopes>;
    tryAddFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures: DepSignatures,
      scope: Scopes,
      key: string,
    ): IServiceManifest<Scopes>;
    /**
     * Value registration, but only when `token` has NO registration yet (the
     * reference `TryAddSingleton<T>(instance)`). A value takes no signatures and
     * no lifetime, exactly like `addValue`.
     */
    tryAddValue(token: Token, value: unknown): IServiceManifest<Scopes>;
    tryAddValue(token: Token, value: unknown, key: string): IServiceManifest<Scopes>;
    /**
     * Drops the token's existing registrations, then registers `ctor` anew (the
     * reference `Replace(descriptor)`).
     */
    replace(token: Token, ctor: Ctor, signatures: DepSignatures): IServiceManifest<Scopes>;
    replace(
      token: Token,
      ctor: Ctor,
      signatures: DepSignatures,
      scope: Scopes,
    ): IServiceManifest<Scopes>;
    replace(
      token: Token,
      ctor: Ctor,
      signatures: DepSignatures,
      scope: Scopes,
      key: string,
    ): IServiceManifest<Scopes>;
    /**
     * Drops the token's existing registrations, then registers a factory anew.
     * The factory-shaped sibling of `replace`.
     */
    replaceFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures: DepSignatures,
    ): IServiceManifest<Scopes>;
    replaceFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures: DepSignatures,
      scope: Scopes,
    ): IServiceManifest<Scopes>;
    replaceFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures: DepSignatures,
      scope: Scopes,
      key: string,
    ): IServiceManifest<Scopes>;
    /** Drops the token's existing registrations, then registers a value anew. */
    replaceValue(token: Token, value: unknown): IServiceManifest<Scopes>;
    replaceValue(token: Token, value: unknown, key: string): IServiceManifest<Scopes>;
  }

  interface ServiceManifestClass<Scopes extends string = 'singleton'> {
    removeAll(token: Token): IServiceManifest<Scopes>;
    tryAdd(token: Token, ctor: Ctor, signatures: DepSignatures): IServiceManifest<Scopes>;
    tryAdd(
      token: Token,
      ctor: Ctor,
      signatures: DepSignatures,
      scope: Scopes,
    ): IServiceManifest<Scopes>;
    tryAdd(
      token: Token,
      ctor: Ctor,
      signatures: DepSignatures,
      scope: Scopes,
      key: string,
    ): IServiceManifest<Scopes>;
    tryAddFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures: DepSignatures,
    ): IServiceManifest<Scopes>;
    tryAddFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures: DepSignatures,
      scope: Scopes,
    ): IServiceManifest<Scopes>;
    tryAddFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures: DepSignatures,
      scope: Scopes,
      key: string,
    ): IServiceManifest<Scopes>;
    tryAddValue(token: Token, value: unknown): IServiceManifest<Scopes>;
    tryAddValue(token: Token, value: unknown, key: string): IServiceManifest<Scopes>;
    replace(token: Token, ctor: Ctor, signatures: DepSignatures): IServiceManifest<Scopes>;
    replace(
      token: Token,
      ctor: Ctor,
      signatures: DepSignatures,
      scope: Scopes,
    ): IServiceManifest<Scopes>;
    replace(
      token: Token,
      ctor: Ctor,
      signatures: DepSignatures,
      scope: Scopes,
      key: string,
    ): IServiceManifest<Scopes>;
    replaceFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures: DepSignatures,
    ): IServiceManifest<Scopes>;
    replaceFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures: DepSignatures,
      scope: Scopes,
    ): IServiceManifest<Scopes>;
    replaceFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures: DepSignatures,
      scope: Scopes,
      key: string,
    ): IServiceManifest<Scopes>;
    replaceValue(token: Token, value: unknown): IServiceManifest<Scopes>;
    replaceValue(token: Token, value: unknown, key: string): IServiceManifest<Scopes>;
  }
}

// `addClass`/`addFactory` are OVERLOADED on arity, so a forwarder holding
// `scope`/`key` as OPTIONAL locals cannot spread them through in one call -- it has
// to pick the overload that matches what it actually got. These two dispatchers are
// that pick, shared by the `tryAdd*` and `replace*` pairs. They always pass
// `signatures` positionally, so the manifest they hand back is ungated.
function addClassTo(
  manifest: IServiceManifest<string>,
  token: Token,
  ctor: Ctor,
  signatures: DepSignatures,
  scope?: string,
  key?: string,
): IServiceManifest<string> {
  if (scope === undefined) {
    return manifest.addClass(token, ctor, signatures);
  }
  if (key === undefined) {
    return manifest.addClass(token, ctor, signatures, scope);
  }
  return manifest.addClass(token, ctor, signatures, scope, key);
}

function addFactoryTo(
  manifest: IServiceManifest<string>,
  token: Token,
  factory: Func<any[], unknown>,
  signatures: DepSignatures,
  scope?: string,
  key?: string,
): IServiceManifest<string> {
  if (scope === undefined) {
    return manifest.addFactory(token, factory, signatures);
  }
  if (key === undefined) {
    return manifest.addFactory(token, factory, signatures, scope);
  }
  return manifest.addFactory(token, factory, signatures, scope, key);
}

// One named object literal mirroring one reference descriptor-mutation static
// class (docs §28): `ServiceManifestDescriptorAugmentations`. The exported const IS
// the standalone call surface; registering it installs the fluent prototype
// methods. Receiver-first members, checked with `satisfies AugmentationSet<R>`.
export const ServiceManifestDescriptorAugmentations = {
  removeAll(
    manifest: ServiceManifestClass<string>,
    token: Token,
  ): IServiceManifest<string> {
    return manifest.removeRegistrations(token);
  },

  tryAdd(
    manifest: ServiceManifestClass<string>,
    token: Token,
    ctor: Ctor,
    signatures: DepSignatures,
    scope?: string,
    key?: string,
  ): IServiceManifest<string> {
    // Already registered: hand the receiver back UNCHANGED. Under an immutable
    // manifest that IS the no-op -- the caller threads the result either way, so
    // there is nothing to swallow and no fake continuation to fabricate.
    if (manifest.hasRegistrations(token)) {
      return manifest;
    }
    return addClassTo(manifest, token, ctor, signatures, scope, key);
  },

  tryAddFactory(
    manifest: ServiceManifestClass<string>,
    token: Token,
    factory: Func<any[], unknown>,
    signatures: DepSignatures,
    scope?: string,
    key?: string,
  ): IServiceManifest<string> {
    if (manifest.hasRegistrations(token)) {
      return manifest;
    }
    return addFactoryTo(manifest, token, factory, signatures, scope, key);
  },

  tryAddValue(
    manifest: ServiceManifestClass<string>,
    token: Token,
    value: unknown,
    key?: string,
  ): IServiceManifest<string> {
    if (manifest.hasRegistrations(token)) {
      return manifest;
    }
    return key === undefined
      ? manifest.addValue(token, value)
      : manifest.addValue(token, value, key);
  },

  replace(
    manifest: ServiceManifestClass<string>,
    token: Token,
    ctor: Ctor,
    signatures: DepSignatures,
    scope?: string,
    key?: string,
  ): IServiceManifest<string> {
    return addClassTo(manifest.removeRegistrations(token), token, ctor, signatures, scope, key);
  },

  replaceFactory(
    manifest: ServiceManifestClass<string>,
    token: Token,
    factory: Func<any[], unknown>,
    signatures: DepSignatures,
    scope?: string,
    key?: string,
  ): IServiceManifest<string> {
    return addFactoryTo(
      manifest.removeRegistrations(token),
      token,
      factory,
      signatures,
      scope,
      key,
    );
  },

  replaceValue(
    manifest: ServiceManifestClass<string>,
    token: Token,
    value: unknown,
    key?: string,
  ): IServiceManifest<string> {
    const kept = manifest.removeRegistrations(token);
    return key === undefined ? kept.addValue(token, value) : kept.addValue(token, value, key);
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

registerAugmentations(tokenfor<IServiceManifest>(), ServiceManifestDescriptorAugmentations);
