// Marks an options registration for eager validation at host startup:
// instead of validating lazily on first resolve, the host forces evaluation
// (running the validate steps) before it starts its hosted services, so
// misconfiguration fails at boot.
//
// `validateOnStart(optionsType)` appends `optionsType` to the startup-validation
// target slot and registers the built-in {@link StartupValidator} under
// `typefor<IStartupValidator>()`. The host resolves that (optionally) and
// calls `validate()`.

import { DefaultManifest, type Manifest, RESOLVER_TYPE } from '@rhombus-std/di.core';
import { type IStartupValidator, StartupValidator } from '@rhombus-std/options';
import type { IServiceProvider } from '@rhombus-std/primitives';
import { type AugmentationSet2, registerAugmentations, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

import { collectionType, startupValidationTargetType } from './option-types.js';

type IManifestValidateOnStartAugmentations<Scopes extends string> = {
  /**
   * Marks the options registered at `optionsType` for eager validation at
   * host startup: the host forces the registration's evaluation (running its
   * validate steps) before starting hosted services, so a validation
   * failure surfaces at boot instead of on first use. Requires a prior
   * {@link addOptions} for the same `optionsType` and a host that resolves
   * the built-in `IStartupValidator`. Returns the manifest produced by its
   * registrations (the manifest chain is immutable -- never `this`).
   */
  validateOnStart(optionsType: Type | string): Manifest<Scopes>;
};

// `Provider` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters), even though the member does not name it.
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string = any> extends IManifestValidateOnStartAugmentations<Scopes> {}
}

// Registered against the `Manifest` augmentation type -- the concrete
// `DefaultManifest`, decorated with `@augment(typefor<Manifest>())`
// in di.core, pulls the member onto its prototype -- and exported so the
// member is also the standalone form.
export const ServiceManifestValidateOnStartAugmentations: AugmentationSet2<DefaultManifest<string>,
  IManifestValidateOnStartAugmentations<string>> = {
    validateOnStart(optionsType) {
      const type = typeof optionsType === 'string' ? Type.from(optionsType) : optionsType;
      // Accumulate the target in the flat startup-validation slot.
      let m: Manifest<string> = this.addValue(startupValidationTargetType(), type);
      // Registers the built-in validator under `IStartupValidator`. di.core has
      // no TryAdd surface (registrations are append-only, last-wins), so a
      // repeated `validateOnStart` appends an equivalent transient registration
      // -- harmless: the host resolves a single `IStartupValidator`, and every
      // registration's factory reads the SAME full target list from the
      // resolver at start time.
      m = m.addFactory(typefor<IStartupValidator>(),
        (resolver: IServiceProvider): IStartupValidator =>
          new StartupValidator(resolver, resolver.getService(collectionType(startupValidationTargetType()))),
        Type.func(typefor<IStartupValidator>(), RESOLVER_TYPE));
      return m;
    },
  };

registerAugmentations(typefor<Manifest>(), ServiceManifestValidateOnStartAugmentations);
