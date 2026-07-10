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

import type { Ctor, Func } from "@rhombus-toolkit/func";

import { type AugmentationSet, installSet } from "./augmentations.js";
import type { Token } from "./Token.js";

// Structural typings for the notify bus -- module-private on purpose: the bus
// and its dispatched events never appear in a public signature, so unlike the
// abort typings these are NOT barrel-exported. Same recipe as ./abort.ts:
// library programs carry zero ambient platform types (docs/decisions.md §39),
// so the platform `EventTarget`/`Event` values are pulled off `globalThis`
// re-typed against the minimal member set this module actually uses.
interface NotifyEvent {
  readonly type: string;
}
interface NotifyEventTarget {
  addEventListener(type: string, listener: Func<[], void>): void;
  dispatchEvent(event: NotifyEvent): boolean;
}
const { EventTarget, Event } = globalThis as unknown as {
  EventTarget: Ctor<[], NotifyEventTarget>;
  Event: Ctor<[type: string], NotifyEvent>;
};

/**
 * The accumulated bag per token: a flat map of member name -> receiver-first
 * function. Typed with `never` receivers because a bag is keyed by an erased
 * `Token` and mixes sets whose exact receiver types are not recoverable here;
 * the precise typing is restored at the `registerAugmentations` call sites via
 * their `AugmentationSet<R>` argument and at the receiver class via `@augment`.
 */
type Bag = Record<string, Func<[receiver: never, ...args: never[]], unknown>>;

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
 *
 * The constraint is `{ prototype: object }` rather than a constructor signature:
 * a class with a PRIVATE constructor (the NullLogger-style singleton) is not
 * assignable to any `new (...) => ...` type outside its own body, yet is a
 * perfectly good augmentation receiver -- only its prototype is touched here.
 */
export function augment(token: Token) {
  return function installOnClass<C extends { readonly prototype: object }>(
    Ctor: C,
    // `unknown` (not `ClassDecoratorContext`): the context type TS synthesizes
    // for a private-constructor class fails ClassDecoratorContext's own
    // constructor-signature constraint, so naming the type here would reject
    // exactly the singleton receivers the widened `C` admits.
    _context?: unknown,
  ): void {
    function pull(): void {
      const bag = bags.get(token);
      if (bag) {
        installSet(
          Ctor as unknown as Ctor<any[], any>,
          bag as unknown as AugmentationSet<any>,
        );
      }
    }
    bus.addEventListener(token, pull);
    pull();
  };
}
