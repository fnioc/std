// Installs augmentation sets onto a receiver class's prototype. A set is a named
// object literal of receiver-first functions (`satisfies AugmentationSet<R>`);
// mounting turns each into a `this`-forwarding method, so callers reach them as
// ordinary instance methods. `applyAugmentations` is the direct path for a
// receiver whose set is known where the class is defined; the augmentation
// registry drives the same `installSet` body for receivers that downstream
// packages extend. Each set is also exported, so its members stay callable
// standalone.
//
// Mounting is a blind merge by member name: a free name gets the forwarding
// thunk; a taken name with a `merge` strategy gets a dispatcher chaining the
// incoming over the existing, and without one throws rather than clobber.

import type { Ctor, Func } from '@rhombus-toolkit/func';

/** An object literal of receiver-first augmentation functions all sharing receiver type R. */
export type AugmentationSet<R> = Record<string, Func<[receiver: R, ...args: any[]], unknown>>;
export type AugmentationSet2<Rec, Impl extends Record<PropertyKey, Func>> = {
  [K in keyof Impl]: Func<[receiver: Rec, ...args: Parameters<Impl[K]>]>;
};
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
export type MergeStrategy = (original: (this: any, ...args: any[]) => unknown,
  extension: Func<[receiver: any, ...args: any[]], unknown>) => (this: any, ...args: any[]) => unknown;

/** Per-member collision resolvers, keyed by the augmentation member name. */
export type MergeStrategies = Record<string, MergeStrategy>;

/**
 * Mounts each augmentation in `augmentations` onto `Ctor.prototype` as a
 * `this`-forwarding method. A name already taken on the prototype is resolved by
 * its `merge` strategy or, with none, throws. `R` is inferred from the class
 * passed at the call site.
 */
export function applyAugmentations<R extends Ctor<any[], any>>(Ctor: R, augmentations: AugmentationSet<InstanceType<R>>,
  merge?: MergeStrategies): void {
  installSet(Ctor, augmentations, merge);
}

/**
 * The shared mounting body behind both `applyAugmentations` and the augmentation
 * registry: mounts each receiver-first function onto `Ctor.prototype` as a
 * `this`-forwarding method. Typed loosely because the registry has only an
 * erased `Token`, not the receiver type; `applyAugmentations` restores it.
 */
export function installSet(Ctor: Ctor<any[], any>, augmentations: AugmentationSet<any>, merge?: MergeStrategies): void {
  const proto = Ctor.prototype as Record<PropertyKey, any>;
  for (const [name, extension] of Object.entries(augmentations)) {
    installMember(Ctor, proto, name, extension, merge?.[name]);
  }
}

/**
 * Mounts one member: a forwarding thunk on a free name, a `merge` dispatcher on a
 * taken one, or a throw when a taken name has no strategy.
 */
function installMember(Ctor: Ctor<any[], any>, proto: Record<PropertyKey, any>, name: string,
  extension: Func<[receiver: any, ...args: any[]], unknown>, strategy: MergeStrategy | undefined): void {
  if (!(name in proto)) {
    proto[name] = function(this: any, ...args: any[]) {
      return extension(this, ...args);
    };
    return;
  }

  if (strategy === undefined) {
    throw new Error(`augmentation "${name}" collides on ${Ctor.name} — supply a merge strategy`);
  }

  const existing = proto[name] as (this: any, ...args: any[]) => unknown;
  const original = function(this: any, ...args: any[]) {
    return existing.call(this, ...args);
  };
  proto[name] = strategy(original, extension);
}
