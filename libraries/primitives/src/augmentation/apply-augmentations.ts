import type { AbstractCtor, Func } from '@rhombus-toolkit/func';
/**
 * A namespace of `this`-based augmentation functions all sharing receiver type R.
 */
export type AugmentationSet<in out R> = {
  [K in keyof R]?: Func<any, unknown, R>;
};
/**
 * A collision resolver for a single augmented member whose name is already
 * taken on the receiver prototype -- the class's own primitive, or a member an
 * earlier registration mounted. It is handed:
 *
 *   - `original` -- the member currently occupying the slot.
 *   - `incoming` -- the augmentation method being installed.
 *
 * It returns
 * the DISPATCHER method that replaces the slot: a pure filter that routes a
 * call to `incoming` when the arguments match that method's own signature, and
 * to `original` otherwise. Routing the primitive-shaped call to `original` is
 * what keeps a wrapper (which typically re-enters the receiver method in
 * primitive shape) from recursing into itself.
 */
export type MergeStrategy<Receiver> = Func<
  [original: Func<any, unknown, Receiver>, incoming: Func<any, unknown, Receiver>],
  Func<any, unknown, Receiver>
>;

/** Per-member collision resolvers, keyed by the augmentation member name. */
export type MergeStrategies<Receiver> = Record<string, MergeStrategy<Receiver>>;

/**
 * Mounts each augmentation in `augmentations` onto `Ctor.prototype` verbatim.
 * A name already taken on the prototype is resolved by its `merge` strategy or,
 * with none, throws.
 */

export function applyAugmentations<Receiver extends object>(
  ctor: AbstractCtor<unknown[], Receiver>,
  augmentations: AugmentationSet<Receiver>,
  merge: MergeStrategies<Receiver> = {},
): void {
  const net = Object.entries(augmentations)
    .map(([key, incoming]) => [key, incoming, ctor.prototype[key], merge[key]] as const)
    .map(([key, incoming, original, strategy]) => {
      return [key, (() => {
        if (!isFunc<Receiver>(incoming)) {
          throw new Error(`augmentation "${key}" on ${ctor.name} must be a function — got a ${typeof incoming}`);
        }
        if (!(key in ctor.prototype)) {
          return incoming;
        }
        if (incoming === original) {
          return original;
        }
        if (!isFunc<Receiver>(original)) {
          throw new Error(
            `augmentation "${key}" collides on ${ctor.name} with a ${typeof original} — only a function can be merged`,
          );
        }
        if (!strategy) {
          throw new Error(`augmentation "${key}" collides on ${ctor.name} — supply a merge strategy`);
        }
        return strategy(original, incoming);
      })()] as const;
    });
  Object.assign(ctor.prototype, Object.fromEntries(net));
}

function isFunc<Receiver>(value: unknown): value is Func<any, unknown, Receiver> {
  return typeof value === 'function';
}
