// Marks an options registration for eager validation at host startup:
// instead of validating lazily on first resolve, the host forces evaluation
// (running the validate steps) before it starts its hosted services, so
// misconfiguration fails at boot.
//
// `validateOnStart(optionsType)` appends that type's `IOptions<T>` address to
// the keyed startup-validation target list and registers the built-in
// {@link StartupValidator} as the `IStartupValidator`. The host resolves that
// (optionally) and calls `validate()`.

import type { Keyed, Manifest } from '@rhombus-std/di.core';
import { type IStartupValidator, StartupValidator } from '@rhombus-std/options';
import type { IServiceProvider, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';

import { optionsAddressType } from './option-types.js';

// `Scopes` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    /**
     * Marks the options registered at `optionsType` for eager validation at
     * host startup: the host forces the registration's evaluation (running its
     * validate steps) before starting hosted services, so a validation
     * failure surfaces at boot instead of on first use. Requires a prior
     * {@link addOptions} for the same `optionsType` and a host that resolves
     * the built-in `IStartupValidator`. Returns the manifest produced by its
     * registrations (the manifest chain is immutable -- never `this`).
     */
    validateOnStart(optionsType: Type): Manifest<Scopes>;
  }
}

registerAugmentations<Manifest<any>>({
  validateOnStart: (() => {
    const valKey = `@rhombus-std/options.augmentations/startup-validation-target`;
    function factory(resolver: IServiceProvider, startupType: Array<Keyed<Type, typeof valKey>>): IStartupValidator {
      return new StartupValidator(resolver, startupType);
    }
    return function validateOnStart(this: Manifest<string>, optionsType: Type): Manifest<string> {
      return this
        // Accumulate the target in the flat startup-validation slot. This is the
        // one slot holding the composed `IOptions<T>` address rather than the bare
        // `T` every other verb keys on, because StartupValidator resolves each
        // target and reads `.value` off it -- so the target has to be resolvable.
        .addValue<Keyed<Type, typeof valKey>>(optionsAddressType(optionsType))
        // One validator serves every target: its factory reads the whole target
        // list off the resolver at start time, not at registration.
        .tryAdd<IStartupValidator>(factory);
    };
  })(),
});
