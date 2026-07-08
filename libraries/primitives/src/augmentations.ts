// The dual-export augmentation infrastructure (docs/decisions.md §28,
// superseding §22).
//
// Every augmentation in the workspace is authored ONCE as a named exported
// object literal that mirrors exactly one reference-stack static extension
// class -- a group of receiver-first functions, checked with `satisfies
// AugmentationSet<R>`. It is then made available in BOTH forms: the object
// literal's members themselves (a fallback / testing surface -- importable, no
// prototype-mutation side effect) AND prototype/instance methods installed via
// `applyAugmentations`. The method form stays the primary path; the standalone
// member form exists for availability, not everyday reach.
//
// This infrastructure lives in `primitives` -- the universal zero-dependency
// leaf -- because di and config must stay mutually unaware (di ⊥ config, §4.3):
// `di.core` is disqualified as the home because the config-provider packages
// would then need a config→di edge just to reach the installer. primitives is
// the only package every family can already depend on.
//
// `primitives` is deliberately dependency-free, so the augmentation-set member
// type is spelled as a bare receiver-first function type here rather than
// pulling in `@rhombus-toolkit/func` (which would fork the leaf's
// zero-dependency invariant).

/** An object literal of receiver-first augmentation functions all sharing receiver type R. */
export type AugmentationSet<R> = Record<string, (receiver: R, ...args: any[]) => unknown>;

/**
 * Dumb installer: mounts each augmentation onto `Ctor.prototype` as a
 * `this`-forwarding method. No validation -- only a library author calls this.
 * The forwarding thunk MUST `return` so fluent chaining survives.
 *
 * `R` is constrained to an actual constructor and the receiver is derived via
 * `InstanceType<R>`, so `Ctor.prototype` is directly typed -- no casts. Call
 * sites pass the class directly and `R` is inferred.
 */
export function applyAugmentations<R extends new(...args: any[]) => any>(
  Ctor: R,
  augmentations: AugmentationSet<InstanceType<R>>,
): void {
  Object.assign(
    Ctor.prototype,
    Object.fromEntries(
      Object.entries(augmentations).map(([name, fn]) => [
        name,
        function(this: InstanceType<R>, ...args: any[]) {
          return fn(this, ...args);
        },
      ]),
    ),
  );
}
