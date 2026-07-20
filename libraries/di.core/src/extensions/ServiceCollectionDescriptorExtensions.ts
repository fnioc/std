// The `ServiceCollectionDescriptorExtensions` augmentation -- descriptor-level
// mutation verbs on the registration builder (docs/decisions.md §28/§38). Mirrors
// the reference DI static class `ServiceCollectionDescriptorExtensions`
// (DependencyInjection.Abstractions/src/Extensions), an OPEN augmentation on the
// registration-collection receiver.
//
// This is an OPEN set (the `ServiceManifest` receiver is extended by many
// downstream families), so it registers against `nameof<IServiceManifest>()`
// through the primitives augmentation registry rather than a direct
// `applyAugmentations` at the class -- the same token every cross-package
// registration augmentation (`addOptions`, `addLogging`, `addMetrics`, ...)
// derives inline. `ServiceManifestClass` is decorated with `@augment(token)` in
// `IServiceManifest.ts`, so registering here reaches its prototype.
//
// Ported members:
//   - `removeAll(token)` -- removes EVERY registration bound to `token` (the
//     reference `RemoveAll(Type)` / `RemoveAll<T>()`; a token is our service-type
//     analog). Required by logging's `clearProviders`, which strips all
//     `ILoggerProvider` registrations. Returns the collection for chaining.
//   - `tryAdd` / `tryAddFactory` / `tryAddValue` -- conditional registration: add
//     only when `token` has NO registration yet (the reference `TryAdd*` family).
//     The class/factory forms return the same `.as(scope?)` continuation `add` /
//     `addFactory` do, so a trailing `.as("singleton")` tags the lifetime exactly
//     as an ordinary registration -- when the token was already present the
//     continuation is a no-op, so the chained `.as()` is safely ignored.
//   - `replace` / `replaceFactory` / `replaceValue` -- unconditional replace:
//     remove the token's existing registrations, then register anew (the
//     reference `Replace(descriptor)`).
//
// DIVERGENCE -- lifetime-named verbs (`TryAddTransient`/`TryAddScoped`/
// `TryAddSingleton`): the reference encodes the lifetime in the METHOD NAME
// because its lifetimes are a fixed three-value enum. std deliberately generalizes
// lifetime to arbitrary NAMED scopes applied through the fluent `.as(scope)`
// continuation (§ `ServiceManifest`): there is no `addSingleton`/`addScoped`/
// `addTransient` anywhere in the surface -- only `add(...).as(scope)`. Mirroring
// the lifetime-named verbs would reintroduce a naming scheme std rejects
// everywhere else and bake in scope names ("singleton"/"scoped") that need not
// exist in a given manifest's `Scopes` union. So the conditional/replace verbs
// stay lifetime-agnostic and thread the lifetime through `.as()`, exactly like
// std's own `add`. (CLAUDE.md: prefer what is idiomatic for TS; the ME mirror is a
// weak tiebreaker.)
//
// DIVERGENCE -- there is no `ServiceDescriptor` object in std (a registration is
// authored directly via `add`/`addFactory`/`addValue`, never as a first-class
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
import { nameof } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';

// Type-only: the const references `ServiceManifestClass` solely in type position
// (the `satisfies` bound and the receiver annotation); the runtime install goes
// through the registry, not a direct `applyAugmentations(ServiceManifestClass, …)`.
import type { AddBuilder } from '../authoring.js';
import type { IServiceManifest, ServiceManifestClass } from '../IServiceManifest.js';
import type { DepSlot, Token } from '../types.js';

// A no-op `.as(scope?)` continuation for the "already registered" branch of a
// `tryAdd`/`tryAddFactory`: the conditional-add did NOT register, so a trailing
// `.as("singleton")` must do nothing rather than tag a registration that is not
// there. Shape-identical to the real `AddBuilder` so the two branches share a
// return type.
const NO_OP_CONTINUATION: AddBuilder<string> = {
  as(): void {},
};

// The authored verbs merge onto core's `IServiceManifestBase` interface -- the
// surface the public `ServiceManifest` a consumer holds resolves to -- AND onto
// the concrete `ServiceManifestClass`, so the class still SATISFIES
// `implements IServiceManifestBase` once the new names are on the interface.
// `Token`, `DepSlot`, `Ctor`, `Func`, and `AddBuilder` are named imports because
// unqualified names in a `declare module` body resolve in THIS file's scope.
// `Provider` is defaulted so each merge matches its target's type-parameter list
// (TS2428 requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
    /**
     * Removes every registration bound to `token` (exact and open). The
     * reference `RemoveAll(Type)` / `RemoveAll<T>()` analog -- a `Token` is our
     * service-type key. Returns the collection so removals chain.
     */
    removeAll(token: Token): this;
    /**
     * Class registration, but only when `token` has NO registration yet (the
     * reference `TryAdd*` for a type/implementation). Returns the same
     * `.as(scope?)` continuation `add` does; a no-op continuation when the token
     * was already registered, so a trailing `.as(...)` is safely ignored.
     */
    tryAdd(
      token: Token,
      ctor: Ctor,
      signatures?: ReadonlyArray<readonly DepSlot[]>,
    ): AddBuilder<Scopes>;
    /**
     * Factory registration, but only when `token` has NO registration yet (the
     * reference `TryAdd*` for a factory). Returns the same `.as(scope?)`
     * continuation `addFactory` does; a no-op continuation when already present.
     */
    tryAddFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures?: ReadonlyArray<readonly DepSlot[]>,
    ): AddBuilder<Scopes>;
    /**
     * Value registration, but only when `token` has NO registration yet (the
     * reference `TryAddSingleton<T>(instance)`). Returns `void` -- a value has no
     * lifetime to tag, exactly like `addValue`.
     */
    tryAddValue(token: Token, value: unknown): void;
    /**
     * Removes the token's existing registrations, then registers `ctor` anew (the
     * reference `Replace(descriptor)`). Returns the `.as(scope?)` continuation so
     * the replacement can tag its lifetime.
     */
    replace(
      token: Token,
      ctor: Ctor,
      signatures?: ReadonlyArray<readonly DepSlot[]>,
    ): AddBuilder<Scopes>;
    /**
     * Removes the token's existing registrations, then registers a factory anew.
     * The factory-shaped sibling of `replace`.
     */
    replaceFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures?: ReadonlyArray<readonly DepSlot[]>,
    ): AddBuilder<Scopes>;
    /** Removes the token's existing registrations, then registers a value anew. */
    replaceValue(token: Token, value: unknown): void;
  }

  interface ServiceManifestClass<Scopes extends string = 'singleton'> {
    removeAll(token: Token): this;
    tryAdd(
      token: Token,
      ctor: Ctor,
      signatures?: ReadonlyArray<readonly DepSlot[]>,
    ): AddBuilder<Scopes>;
    tryAddFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures?: ReadonlyArray<readonly DepSlot[]>,
    ): AddBuilder<Scopes>;
    tryAddValue(token: Token, value: unknown): void;
    replace(
      token: Token,
      ctor: Ctor,
      signatures?: ReadonlyArray<readonly DepSlot[]>,
    ): AddBuilder<Scopes>;
    replaceFactory(
      token: Token,
      factory: Func<any[], unknown>,
      signatures?: ReadonlyArray<readonly DepSlot[]>,
    ): AddBuilder<Scopes>;
    replaceValue(token: Token, value: unknown): void;
  }
}

// One named object literal mirroring one reference static class (docs §28):
// `ServiceCollectionDescriptorExtensions`. The exported const IS the standalone
// call surface; registering it installs the fluent prototype methods. Receiver-
// first members, checked with `satisfies AugmentationSet<R>`.
export const ServiceCollectionDescriptorExtensions = {
  removeAll(
    manifest: ServiceManifestClass<string>,
    token: Token,
  ): ServiceManifestClass<string> {
    manifest.removeRegistrations(token);
    return manifest;
  },

  tryAdd(
    manifest: ServiceManifestClass<string>,
    token: Token,
    ctor: Ctor,
    signatures?: ReadonlyArray<readonly DepSlot[]>,
  ): AddBuilder<string> {
    if (manifest.hasRegistrations(token)) {
      return NO_OP_CONTINUATION;
    }
    return manifest.add(token, ctor, signatures);
  },

  tryAddFactory(
    manifest: ServiceManifestClass<string>,
    token: Token,
    factory: Func<any[], unknown>,
    signatures?: ReadonlyArray<readonly DepSlot[]>,
  ): AddBuilder<string> {
    if (manifest.hasRegistrations(token)) {
      return NO_OP_CONTINUATION;
    }
    return manifest.addFactory(token, factory, signatures);
  },

  tryAddValue(
    manifest: ServiceManifestClass<string>,
    token: Token,
    value: unknown,
  ): void {
    if (manifest.hasRegistrations(token)) {
      return;
    }
    manifest.addValue(token, value);
  },

  replace(
    manifest: ServiceManifestClass<string>,
    token: Token,
    ctor: Ctor,
    signatures?: ReadonlyArray<readonly DepSlot[]>,
  ): AddBuilder<string> {
    manifest.removeRegistrations(token);
    return manifest.add(token, ctor, signatures);
  },

  replaceFactory(
    manifest: ServiceManifestClass<string>,
    token: Token,
    factory: Func<any[], unknown>,
    signatures?: ReadonlyArray<readonly DepSlot[]>,
  ): AddBuilder<string> {
    manifest.removeRegistrations(token);
    return manifest.addFactory(token, factory, signatures);
  },

  replaceValue(
    manifest: ServiceManifestClass<string>,
    token: Token,
    value: unknown,
  ): void {
    manifest.removeRegistrations(token);
    manifest.addValue(token, value);
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

registerAugmentations(nameof<IServiceManifest>(), ServiceCollectionDescriptorExtensions);
