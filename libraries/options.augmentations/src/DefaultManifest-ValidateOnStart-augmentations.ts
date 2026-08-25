// Marks an options registration for eager validation at host startup:
// instead of validating lazily on first resolve, the host forces evaluation
// (running the validate steps) before it starts its hosted services, so
// misconfiguration fails at boot.
//
// getValidateOnStartManifest(optionsType) returns a manifest appending that
// type's `IOptions<T>` address to the keyed startup-validation target list
// and registering the built-in StartupValidator as the IStartupValidator —
// merge it into a container's registrations with `addMany`. The host
// resolves that (optionally) and calls `validate()`.

// Type-only: puts the sugar's declare-module faces in every program that
// compiles this source, with no runtime import of the authoring package.
import type {} from '@rhombus-std/di.extras';
import { type IServiceProvider, type Keyed, Manifest } from '@rhombus-std/di.core';
import { type IStartupValidator, StartupValidator } from '@rhombus-std/options';
import type { Type } from '@rhombus-std/primitives';

import { optionsAddressType } from './option-types.js';

const valKey = `@rhombus-std/options.augmentations/startup-validation-target`;

function factory(resolver: IServiceProvider, startupType: Array<Keyed<Type, typeof valKey>>): IStartupValidator {
  return new StartupValidator(resolver, startupType);
}

/**
 * Marks the options registered at `optionsType` for eager validation at host
 * startup, as its own manifest — merge it into a container's registrations
 * with `addMany`. The host forces the registration's evaluation (running its
 * validate steps) before starting hosted services, so a validation failure
 * surfaces at boot instead of on first use. Requires a prior `addOptions` for
 * the same `optionsType` and a host that resolves the built-in
 * `IStartupValidator`.
 */
export function getValidateOnStartManifest(optionsType: Type): Manifest<unknown> {
  return Manifest.empty<unknown>()
    // Accumulate the target in the flat startup-validation slot. This is the
    // one slot holding the composed `IOptions<T>` address rather than the bare
    // `T` every other verb keys on, because StartupValidator resolves each
    // target and reads `.value` off it — so the target has to be resolvable.
    .addValue<Keyed<Type, typeof valKey>>(optionsAddressType(optionsType))
    // One validator serves every target: its factory reads the whole target
    // list off the resolver at start time, not at registration — so merging
    // several of these manifests together is safe even though each one adds
    // its own registration: only the newest is ever resolved, and every copy
    // reads the same accumulated target list at that point.
    .tryAdd<IStartupValidator>(factory);
}
