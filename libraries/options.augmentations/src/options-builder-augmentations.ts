// validateOnStart -- ported from the reference Options project's
// `OptionsBuilderExtensions.ValidateOnStart<TOptions>`. Marks an options
// registration for eager validation at host startup: instead of validating
// lazily on first resolve, the host forces evaluation (running the validate
// steps) before it starts its hosted services, so misconfiguration fails at boot.
//
// Receiver divergence (precedented): the reference verb hangs off
// `OptionsBuilder<TOptions>`, which this stack does not port -- the collapsed
// options family registers per-token pipeline steps on the manifest (§4.2), so
// `validate` / `postConfigure` already collapsed onto `ServiceManifest`. This
// member follows them: a manifest verb keyed by the options `token`. It keeps the
// reference class name `OptionsBuilderExtensions` (§28: one object literal per
// reference static class) even though the receiver is the manifest, so a later
// OptionsBuilder-family member has a home.
//
// Mechanism (§12 collection resolution, NOT the reference's
// StartupValidatorOptions-through-the-options-pipeline indirection -- see
// StartupValidator for why that shape does not translate): `validateOnStart(token)`
// appends `token` to the startup-validation target slot and registers the
// built-in {@link StartupValidator} under `nameof<IStartupValidator>()`. The host
// resolves that (optionally) and calls `validate()`.

import { type Resolver, RESOLVER_TOKEN, type ServiceManifest, ServiceManifestClass,
  type Token } from '@rhombus-std/di.core';
import { type IStartupValidator, StartupValidator } from '@rhombus-std/options';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';

import { collectionToken, startupValidationTargetToken } from './option-tokens.js';

// `validateOnStart` is a BRAND-NEW method name, so it must merge onto BOTH the
// `ServiceManifestBase` interface (the surface the public `ServiceManifest` type
// resolves to) AND the concrete `ServiceManifestClass`, so the class still
// SATISFIES `implements ServiceManifestBase` once the new name is on the
// interface -- exactly as the other verbs in this package do. Type-parameter
// lists MUST match each target's declaration (TS2428).
declare module '@rhombus-std/di.core' {
  interface ServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
    /**
     * Marks the options registered at `token` for eager validation at host
     * startup: the host forces the registration's evaluation (running its
     * validate steps) before starting hosted services, so a validation failure
     * surfaces at boot instead of on first use. Requires a prior
     * {@link addOptions} for the same `token` and a host that resolves the
     * built-in `IStartupValidator`. Returns the collection for chaining. The
     * reference `OptionsBuilder.ValidateOnStart<T>` analog -- collapsed onto the
     * manifest (OptionsBuilder is unported).
     */
    validateOnStart(token: Token): this;
  }

  interface ServiceManifestClass<Scopes extends string = 'singleton'> {
    validateOnStart(token: Token): this;
  }
}

// One named object literal mirroring the reference `OptionsBuilderExtensions`
// static class (docs §28), registered against the `ServiceManifest` augmentation
// token (docs §38) -- the concrete `ServiceManifestClass`, decorated with
// `@augment(nameof<ServiceManifest>())` in di.core, pulls the member onto its
// prototype -- AND exported so the member is the standalone form.
export const OptionsBuilderExtensions = {
  validateOnStart(
    manifest: ServiceManifestClass<string>,
    token: Token,
  ): ServiceManifestClass<string> {
    // Accumulate the target in the flat startup-validation slot.
    manifest.addValue(startupValidationTargetToken(), token);
    // Register the built-in validator under `IStartupValidator`. di.core has no
    // TryAdd surface (registrations are append-only, last-wins), so a repeated
    // `validateOnStart` appends an equivalent transient registration -- harmless:
    // the host resolves a single `IStartupValidator`, and every registration's
    // factory reads the SAME full target list from the resolver at start time
    // (the `addLogging` "add, not TryAdd" precedent).
    manifest.addFactory(
      nameof<IStartupValidator>(),
      (resolver: Resolver): IStartupValidator =>
        new StartupValidator(
          resolver,
          resolver.resolve<readonly Token[]>(collectionToken(startupValidationTargetToken())),
        ),
      [[RESOLVER_TOKEN]],
    );
    return manifest;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

registerAugmentations(nameof<ServiceManifest>(), OptionsBuilderExtensions);
