// The dual-export augmentation infrastructure (docs/decisions.md §28/§38,
// superseding §22).
//
// Every augmentation in the workspace is authored ONCE as a named exported
// object literal that mirrors exactly one reference-stack static augmentation
// class -- a group of receiver-first functions, checked with `satisfies
// AugmentationSet<R>`. It is then made available in BOTH forms: the object
// literal's members themselves (a fallback / testing surface -- importable, no
// prototype-mutation side effect) AND prototype/instance methods installed via
// `applyAugmentations`. The method form stays the primary path; the standalone
// member form exists for availability, not everyday reach.
//
// Two install paths share the same thunk-mounting body (`installSet`):
//   - `applyAugmentations` -- the CLOSED-set path. The receiver interface AND
//     all its augmentations are owned inside one family's own `.core`, so the
//     install can happen directly at the concrete class definition (no token,
//     no registry).
//   - the augmentation registry (`augmentation-registry.ts`) -- the OPEN-set
//     path for builder interfaces downstream packages extend (ServiceManifest,
//     ConfigurationBuilder, ILoggingBuilder, ...). It calls `installSet`
//     through a token + EventTarget so late-registered augmentations still
//     reach an already-decorated class prototype.
//
// This infrastructure lives in `primitives` -- the universal leaf every
// family can already depend on -- because di and config must stay mutually
// unaware (di ⊥ config, §4.3): `di.core` is disqualified as the home because
// the config-provider packages would then need a config→di edge just to
// reach the installer.

import type { Ctor, Func } from "@rhombus-toolkit/func";

/** An object literal of receiver-first augmentation functions all sharing receiver type R. */
export type AugmentationSet<R> = Record<string, Func<[receiver: R, ...args: any[]], unknown>>;

/**
 * Dumb installer: mounts each augmentation onto `Ctor.prototype` as a
 * `this`-forwarding method. No validation -- only a library author calls this.
 * The forwarding thunk MUST `return` so fluent chaining survives.
 *
 * `R` is constrained to an actual constructor and the receiver is derived via
 * `InstanceType<R>`, so `Ctor.prototype` is directly typed -- no casts. Call
 * sites pass the class directly and `R` is inferred.
 */
export function applyAugmentations<R extends Ctor<any[], any>>(
  Ctor: R,
  augmentations: AugmentationSet<InstanceType<R>>,
): void {
  installSet(Ctor, augmentations);
}

/**
 * The shared thunk-mounting body behind BOTH install paths
 * (`applyAugmentations` and the augmentation registry). Mounts each
 * receiver-first function onto `Ctor.prototype` as a `this`-forwarding method
 * that returns the callee's result (so fluent chaining survives).
 *
 * Idempotent: re-installing the same set overwrites each prototype slot with an
 * identical thunk, so the registry can pull a token's full bag repeatedly as
 * later augmentations register.
 *
 * Typed loosely (constructor + bare-function set) because the registry mounts
 * bags keyed by an erased `Token`, where the exact receiver type is not
 * recoverable; the public `applyAugmentations` wrapper restores the precise
 * `InstanceType<R>` receiver typing at its call sites.
 */
export function installSet(
  Ctor: Ctor<any[], any>,
  augmentations: AugmentationSet<any>,
): void {
  Object.assign(
    Ctor.prototype,
    Object.fromEntries(
      Object.entries(augmentations).map(([name, fn]) => [
        name,
        function(this: any, ...args: any[]) {
          return fn(this, ...args);
        },
      ]),
    ),
  );
}
