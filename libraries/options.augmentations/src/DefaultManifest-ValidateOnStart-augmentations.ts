// Marks an options registration for eager validation at host startup:
// instead of validating lazily on first resolve, the host forces evaluation
// (running the validate steps) before it starts its hosted services, so
// misconfiguration fails at boot.
//
// `validateOnStart(type)` appends that type's `IOptions<T>` address to the
// startup-validation target slot and registers the built-in
// {@link StartupValidator} under `typefor<IStartupValidator>()`. The host
// resolves that (optionally) and calls `validate()`.

import { Hole, type Manifest, RESOLVER_TYPE } from '@rhombus-std/di.core';
import { type IStartupValidator, StartupValidator } from '@rhombus-std/options';
import type { IServiceProvider } from '@rhombus-std/primitives';
import { Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';

import { Keyed } from '@rhombus-std/di.core';
import { collectionType, optionsAddressType, startupValidationTargetType } from './option-types.js';

// `Scopes` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    /**
     * Marks the options registered at `type` for eager validation at
     * host startup: the host forces the registration's evaluation (running its
     * validate steps) before starting hosted services, so a validation
     * failure surfaces at boot instead of on first use. Requires a prior
     * {@link addOptions} for the same `type` and a host that resolves
     * the built-in `IStartupValidator`. Returns the manifest produced by its
     * registrations (the manifest chain is immutable -- never `this`).
     */
    validateOnStart(type: Type): Manifest<Scopes>;
  }
}

registerAugmentations<Manifest<any>>({
  validateOnStart: (() => {
    const valKey = `@rhombus-std/options.augmentations/startup-validation-target`;
    function factory(resolver: IServiceProvider, startupType: Array<Keyed<Type, typeof valKey>>): IStartupValidator {
      return new StartupValidator(resolver, startupType);
    }
    return function validateOnStart(this: Manifest<string>, type: Type): Manifest<string> {
      return this
        // Accumulate the target in the flat startup-validation slot. This is the
        // one slot holding the composed `IOptions<T>` address rather than the bare
        // `T` every other verb keys on, because StartupValidator resolves each
        // target and reads `.value` off it -- so the target has to be resolvable.
        .add<Keyed<Type, typeof valKey>>(Type.imported('IOptions', '@rhombus-std/options', [type]))
        // One validator serves every target: its factory reads the whole target
        // list off the resolver at start time, not at registration.
        .tryAdd<IStartupValidator>(factory, typefor(factory));
    };
  })(),
});
