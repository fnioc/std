// Installs augmentation sets onto a receiver class's prototype. A set is a named
// object literal of `this`-based methods; mounting assigns each onto the
// prototype VERBATIM, so the installed member IS the authored function
// (`proto[name] === set[name]`) and callers reach it as an ordinary instance
// method. `applyAugmentations` is the direct path for a receiver whose set is
// known where the class is defined; the augmentation registry drives the same
// `installSet` body for receivers that downstream packages extend. Each set is
// also exported, so its members stay reachable standalone — call one on an
// uninstalled receiver as `set.member.call(receiver, ...args)`.
//
// Mounting is a blind merge by member name: a free name takes the method
// itself; a name already holding that same function is a no-op; a taken name
// with a `merge` strategy gets a dispatcher chaining the incoming over the
// existing, and without one throws rather than clobber.

import type { Ctor, Func } from '@rhombus-toolkit/func';

// Both set types spell their members' receiver as a `this` parameter — the one
// function-type position `Func` cannot express — so an authored object literal
// method gets `this: R` contextually, with no per-member annotation. A ThisType
// intersection would read better but is ruled out: intersecting strips the
// implicit index signature that lets a concrete set satisfy the erased
// `Record`-typed parameters below.

/** An object literal of `this`-based augmentation methods all sharing receiver type R. */
export type AugmentationSet<in R> = Record<string, (this: R, ...args: any[]) => unknown>;
export type AugmentationSet2<in Rec, Impl extends Record<PropertyKey, Func>> = {
  [K in keyof Impl]: (this: Rec, ...args: Parameters<Impl[K]>) => any;
};
/**
 * A collision resolver for a single augmented member whose name is already
 * taken on the receiver prototype -- the class's own primitive, or a member an
 * earlier registration mounted. It is handed:
 *
 *   - `original` -- the member currently occupying the slot.
 *   - `incoming` -- the augmentation method being installed.
 *
 * Both are `this`-based; call either as `fn.call(this, ...args)`. It returns
 * the DISPATCHER method that replaces the slot: a pure filter that routes a
 * call to `incoming` when the arguments match that method's own signature, and
 * to `original` otherwise. Routing the primitive-shaped call to `original` is
 * what keeps a wrapper (which typically re-enters the receiver method in
 * primitive shape) from recursing into itself.
 */
export type MergeStrategy = (original: (this: any, ...args: any[]) => unknown,
  incoming: (this: any, ...args: any[]) => unknown) => (this: any, ...args: any[]) => unknown;

/** Per-member collision resolvers, keyed by the augmentation member name. */
export type MergeStrategies = Record<string, MergeStrategy>;

/**
 * Mounts each augmentation in `augmentations` onto `Ctor.prototype` verbatim.
 * A name already taken on the prototype is resolved by its `merge` strategy or,
 * with none, throws. `R` is inferred from the class passed at the call site.
 */
export function applyAugmentations<R extends Ctor<any[], any>>(Ctor: R, augmentations: AugmentationSet<InstanceType<R>>,
  merge?: MergeStrategies): void {
  installSet(Ctor, augmentations, merge);
}

/**
 * The shared mounting body behind both `applyAugmentations` and the augmentation
 * registry: assigns each `this`-based method onto `Ctor.prototype` unchanged.
 * Typed loosely because the registry has only an erased `Type`, not the
 * receiver type; `applyAugmentations` restores it.
 */
export function installSet(Ctor: Ctor<any[], any>, augmentations: AugmentationSet<any>, merge?: MergeStrategies): void {
  const proto = Ctor.prototype as Record<PropertyKey, any>;
  for (const [name, augmentation] of Object.entries(augmentations)) {
    installMember(Ctor, proto, name, augmentation, merge?.[name]);
  }
}

/**
 * Mounts one member: the method itself on a free name, a `merge` dispatcher on
 * a taken one, or a throw when a taken name has no strategy. A slot already
 * holding this very function is left alone, so re-installing a set is a no-op
 * rather than a collision.
 */
function installMember(Ctor: Ctor<any[], any>, proto: Record<PropertyKey, any>, name: string,
  augmentation: Func<any[], unknown>, strategy: MergeStrategy | undefined): void {
  if (!(name in proto)) {
    proto[name] = augmentation;
    return;
  }
  if (proto[name] === augmentation) {
    return;
  }

  if (strategy === undefined) {
    throw new Error(`augmentation "${name}" collides on ${Ctor.name} — supply a merge strategy`);
  }

  proto[name] = strategy(proto[name] as (this: any, ...args: any[]) => unknown, augmentation);
}
