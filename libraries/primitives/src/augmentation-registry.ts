// The augmentation REGISTRY -- the OPEN-set install path (docs/decisions.md §38,
// building on the §28 authoring shape).
//
// CLOSED sets (receiver interface AND all its augmentations owned inside one
// family's own `.core`) keep the direct `applyAugmentations` call at the
// concrete class definition -- no token, no registry. OPEN builder interfaces
// (ServiceManifest, ConfigurationBuilder, ILoggingBuilder, ...) are extended by
// DOWNSTREAM packages that load after the concrete class is already defined, so
// a one-shot install cannot see them. The registry closes that gap with a plain
// `EventTarget` notify bus -- NO Proxy, NO observable/Subject:
//
//   - `registerAugmentations(token, set)` -- each extender package calls this at
//     import time, beside its `declare module` type merge. It merges `set` into
//     the token's bag, then dispatches an `Event(token)` on the bus.
//   - `augment(token)` -- a class decorator on the concrete receiver class. It
//     subscribes a listener that (re)installs the token's FULL bag onto the
//     prototype, then pulls once immediately. The listener stays subscribed, so
//     augmentations registered AFTER the class was decorated reach the prototype
//     on their next dispatch.
//
// Registration and decoration may happen in either order and any number of
// times; installs are idempotent (see `installSet`).
//
// Runtime-identity invariant (§9/§38): every bundle MUST keep
// `@rhombus-std/primitives` EXTERNAL. Inlining a private copy forks this Map +
// bus, and the registry silently splits -- a class decorated against one copy
// never sees augmentations registered against the other.

import { type AugmentationSet, installSet } from "./augmentations.js";
import type { Token } from "./token.js";

/**
 * The accumulated bag per token: a flat map of member name -> receiver-first
 * function. Typed with `never` receivers because a bag is keyed by an erased
 * `Token` and mixes sets whose exact receiver types are not recoverable here;
 * the precise typing is restored at the `registerAugmentations` call sites via
 * their `AugmentationSet<R>` argument and at the receiver class via `@augment`.
 */
type Bag = Record<string, (receiver: never, ...args: never[]) => unknown>;

/** One accumulated bag per token. */
const bags = new Map<Token, Bag>();

/** The notify bus. The dispatched `Event`'s `type` IS the token string. */
const bus = new EventTarget();

/**
 * Merge `set` into `token`'s bag, then notify every class decorated with
 * `@augment(token)` so the new members reach their prototypes.
 *
 * Throws on a duplicate member name for a token: the bag namespace is flat and
 * install order is deliberately unordered, so a silent clobber would make the
 * winning implementation depend on import order. Two sets registered to one
 * token may therefore never share a member name.
 */
export function registerAugmentations<R>(token: Token, set: AugmentationSet<R>): void {
  const bag = bags.get(token) ?? {};
  for (const name of Object.keys(set)) {
    if (name in bag) {
      throw new Error(
        `augmentation member "${name}" is already registered for token "${token}"`,
      );
    }
  }
  bags.set(token, Object.assign(bag, set as Bag));
  bus.dispatchEvent(new Event(token));
}

/**
 * Class decorator: (re)install `token`'s full bag onto the decorated class's
 * prototype -- now, and again on every later `registerAugmentations(token, ...)`.
 *
 * Works as a TC39 standard class decorator (`@augment(TOKEN)`) AND as a plain
 * statement (`augment(TOKEN)(TheClass)`); both forms call it identically. The
 * subscription is never torn down -- a decorated class is a module singleton
 * that lives for the process, and staying subscribed is exactly what lets a
 * downstream package's later registration reach an already-defined class.
 */
export function augment(token: Token) {
  return function installOnClass<C extends abstract new(...args: never[]) => unknown>(
    Ctor: C,
    _context?: ClassDecoratorContext,
  ): void {
    function pull(): void {
      const bag = bags.get(token);
      if (bag) {
        installSet(
          Ctor as unknown as new(...args: any[]) => any,
          bag as unknown as AugmentationSet<any>,
        );
      }
    }
    bus.addEventListener(token, pull);
    pull();
  };
}
