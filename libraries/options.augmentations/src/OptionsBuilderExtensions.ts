// Marks an options registration for eager validation at host startup:
// instead of validating lazily on first resolve, the host forces evaluation
// (running the validate steps) before it starts its hosted services, so
// misconfiguration fails at boot.
//
// `validateOnStart(token)` appends `token` to the startup-validation target
// slot and registers the built-in {@link StartupValidator} under
// `tokenfor<IStartupValidator>()`. The host resolves that (optionally) and
// calls `validate()`.

import { type IResolver, type IServiceManifest, RESOLVER_TOKEN, ServiceManifestClass,
  type Token } from '@rhombus-std/di.core';
import { type IStartupValidator, StartupValidator } from '@rhombus-std/options';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';

import { collectionToken, startupValidationTargetToken } from './option-tokens.js';

// `validateOnStart` is a BRAND-NEW method name, so it must merge onto BOTH the
// `IServiceManifestBase` interface (the surface the public `ServiceManifest` type
// resolves to) AND the concrete `ServiceManifestClass`, so the class still
// SATISFIES `implements IServiceManifestBase` once the new name is on the
// interface -- exactly as the other verbs in this package do. Type-parameter
// lists MUST match each target's declaration (TS2428).
declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
    /**
     * Marks the options registered at `token` for eager validation at host
     * startup: the host forces the registration's evaluation (running its
     * validate steps) before starting hosted services, so a validation
     * failure surfaces at boot instead of on first use. Requires a prior
     * {@link addOptions} for the same `token` and a host that resolves the
     * built-in `IStartupValidator`. Returns the manifest produced by its
     * registrations (the manifest chain is immutable -- never `this`).
     */
    validateOnStart(token: Token): IServiceManifest<Scopes>;
  }

  interface ServiceManifestClass<Scopes extends string = 'singleton'> {
    validateOnStart(token: Token): IServiceManifest<Scopes>;
  }
}

// Registered against the `ServiceManifest` augmentation token -- the concrete
// `ServiceManifestClass`, decorated with `@augment(tokenfor<IServiceManifest>())`
// in di.core, pulls the member onto its prototype -- and exported so the
// member is also the standalone form.
export const OptionsBuilderExtensions = {
  validateOnStart(manifest: ServiceManifestClass<string>, token: Token): IServiceManifest<string> {
    // Accumulate the target in the flat startup-validation slot.
    let m: IServiceManifest<string> = manifest.addValue(startupValidationTargetToken(), token);
    // Registers the built-in validator under `IStartupValidator`. di.core has
    // no TryAdd surface (registrations are append-only, last-wins), so a
    // repeated `validateOnStart` appends an equivalent transient registration
    // -- harmless: the host resolves a single `IStartupValidator`, and every
    // registration's factory reads the SAME full target list from the
    // resolver at start time.
    m = m.addFactory(tokenfor<IStartupValidator>(),
      (resolver: IResolver): IStartupValidator =>
        new StartupValidator(resolver,
          resolver.resolve<readonly Token[]>(collectionToken(startupValidationTargetToken()))), [[RESOLVER_TOKEN]]);
    return m;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

registerAugmentations(tokenfor<IServiceManifest>(), OptionsBuilderExtensions);
