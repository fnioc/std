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
//     ConfigBuilder, ILoggingBuilder, ...). It calls `installSet`
//     through a token + a synchronous per-token subscriber list so
//     late-registered augmentations still reach an already-decorated class
//     prototype.
//
// This infrastructure lives in `primitives` -- the universal leaf every
// family can already depend on -- because di and config must stay mutually
// unaware (di ⊥ config, §4.3): `di.core` is disqualified as the home because
// the config-provider packages would then need a config→di edge just to
// reach the installer.
//
// COLLISION MODEL (docs/decisions.md §79). Installing a member onto a prototype
// is a BLIND merge -- no tokens, no receivers, no member identity enter the
// decision. The only question `installMember` asks is "is a member already
// mounted at this name?":
//   - name FREE  -> mount the `this`-forwarding thunk.
//   - name TAKEN -> a genuinely different registration is colliding (the class's
//     own primitive, a base-class member, or a member a different token/set
//     already installed onto this same prototype). With a `merge` strategy for
//     the name, mount a DISPATCHER chaining the incoming over the existing;
//     WITHOUT one, THROW rather than silently clobber.
// Nothing is ever installed twice over itself: the registry drives installs as
// deltas (each registration's own members, once), so a member reaches a given
// prototype exactly once. There is therefore no idempotency/marker bookkeeping
// here -- a second arrival at a taken name is, by construction, a real collision.

import type { Ctor, Func } from '@rhombus-toolkit/func';

/** An object literal of receiver-first augmentation functions all sharing receiver type R. */
export type AugmentationSet<R> = Record<string, Func<[receiver: R, ...args: any[]], unknown>>;

/**
 * A collision resolver for a single augmented member whose name is already
 * taken on the receiver prototype -- the class's own primitive, or a member an
 * earlier registration mounted. It is handed:
 *
 *   - `original` -- the member currently occupying the slot, adapted to a
 *     `this`-bound method. Call it as `original.call(this, ...args)`.
 *   - `extension` -- the incoming augmentation function, receiver-first. Call it
 *     as `extension(this, ...args)`.
 *
 * and returns the DISPATCHER method that replaces the slot: a pure filter that
 * routes a call to `extension` when the arguments match the extension's own
 * signature, and to `original` otherwise. Routing the primitive-shaped call to
 * `original` is what keeps a wrapper (which typically re-enters the receiver
 * method in primitive shape) from recursing into itself.
 */
export type MergeStrategy = (
  original: (this: any, ...args: any[]) => unknown,
  extension: Func<[receiver: any, ...args: any[]], unknown>,
) => (this: any, ...args: any[]) => unknown;

/** Per-member collision resolvers, keyed by the augmentation member name. */
export type MergeStrategies = Record<string, MergeStrategy>;

/**
 * Dumb installer: mounts each augmentation onto `Ctor.prototype` as a
 * `this`-forwarding method. Only a library author calls this. The forwarding
 * thunk MUST `return` so fluent chaining survives. Collisions are resolved by
 * `merge` (a per-name strategy) or refused -- see `installMember`.
 *
 * `R` is constrained to an actual constructor and the receiver is derived via
 * `InstanceType<R>`, so `Ctor.prototype` is directly typed -- no casts. Call
 * sites pass the class directly and `R` is inferred.
 */
export function applyAugmentations<R extends Ctor<any[], any>>(
  Ctor: R,
  augmentations: AugmentationSet<InstanceType<R>>,
  merge?: MergeStrategies,
): void {
  installSet(Ctor, augmentations, merge);
}

/**
 * The shared thunk-mounting body behind BOTH install paths
 * (`applyAugmentations` and the augmentation registry). Mounts each
 * receiver-first function onto `Ctor.prototype` as a `this`-forwarding method
 * that returns the callee's result (so fluent chaining survives).
 *
 * Typed loosely (constructor + bare-function set) because the registry mounts
 * bags keyed by an erased `Token`, where the exact receiver type is not
 * recoverable; the public `applyAugmentations` wrapper restores the precise
 * `InstanceType<R>` receiver typing at its call sites.
 */
export function installSet(
  Ctor: Ctor<any[], any>,
  augmentations: AugmentationSet<any>,
  merge?: MergeStrategies,
): void {
  const proto = Ctor.prototype as Record<PropertyKey, any>;
  for (const [name, extension] of Object.entries(augmentations)) {
    installMember(Ctor, proto, name, extension, merge?.[name]);
  }
}

/**
 * Mounts one augmentation member with a BLIND merge (docs §79):
 *   - name free       -> a plain `this`-forwarding thunk.
 *   - name taken + strategy -> a dispatcher chaining the incoming over whatever
 *     already occupies the slot (the primitive, or a prior installation).
 *   - name taken + no strategy -> THROW, never clobber.
 * No token/receiver/member identity is consulted -- the sole input is whether
 * the name is already taken.
 */
function installMember(
  Ctor: Ctor<any[], any>,
  proto: Record<PropertyKey, any>,
  name: string,
  extension: Func<[receiver: any, ...args: any[]], unknown>,
  strategy: MergeStrategy | undefined,
): void {
  if (!(name in proto)) {
    proto[name] = function(this: any, ...args: any[]) {
      return extension(this, ...args);
    };
    return;
  }

  if (strategy === undefined) {
    throw new Error(
      `augmentation "${name}" collides on ${Ctor.name} — supply a merge strategy`,
    );
  }

  const existing = proto[name] as (this: any, ...args: any[]) => unknown;
  const original = function(this: any, ...args: any[]) {
    return existing.call(this, ...args);
  };
  proto[name] = strategy(original, extension);
}
