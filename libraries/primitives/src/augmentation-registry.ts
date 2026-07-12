// The augmentation REGISTRY -- the OPEN-set install path (docs/decisions.md §38,
// §73, building on the §28 authoring shape).
//
// CLOSED sets (receiver interface AND all its augmentations owned inside one
// family's own `.core`) keep the direct `applyAugmentations` call at the
// concrete class definition -- no token, no registry. OPEN builder interfaces
// (ServiceManifest, ConfigurationBuilder, ILoggingBuilder, ...) are extended by
// DOWNSTREAM packages that load after the concrete class is already defined, so
// a one-shot install cannot see them. The registry closes that gap with a plain
// `EventTarget` notify bus -- NO Proxy, NO observable/Subject:
//
//   - `registerAugmentations(token, set, merge?)` -- each extender package calls
//     this at import time, beside its `declare module` type merge. It appends
//     `set`'s members into the token's bag (a per-name list -- a second same-name
//     registration accumulates, it does NOT throw here, §73/3), records any
//     `merge` strategies, then dispatches a DELTA event carrying JUST this set.
//   - `augment(token)` -- a class decorator on the concrete receiver class. On
//     first application it installs the token's currently-accumulated members
//     ONCE (catch-up for anything registered before the class was decorated),
//     and subscribes a listener that installs ONLY each later registration's
//     DELTA -- never the whole bag again.
//
// DELTA INSTALL (docs §73/1) is the core of the design. The old listener
// re-installed the ENTIRE accumulated bag on every dispatch, so a member on a
// heavily-shared token (eight config providers all register onto
// `nameof<IConfigurationBuilder>()`) was re-installed once per later
// registration. Now a member reaches a given prototype exactly ONCE: the
// catch-up pull covers members registered before decoration, and each dispatch
// installs only its own set. Double-installs are impossible by construction, so
// the install path (`installMember`) needs no idempotency bookkeeping -- a
// second arrival at a taken name is a genuine collision (§73/2).
//
// Registration and decoration may happen in either order and any number of
// times.
//
// Runtime-identity invariant (§9/§38): every bundle MUST keep
// `@rhombus-std/primitives` EXTERNAL. Inlining a private copy forks this Map +
// bus, and the registry silently splits -- a class decorated against one copy
// never sees augmentations registered against the other.

import type { Ctor, Func } from '@rhombus-toolkit/func';

import { type AugmentationSet, installSet, type MergeStrategies } from './augmentations.js';
import type { Token } from './Token.js';

// Structural typings for the notify bus -- module-private on purpose: the bus
// and its dispatched events never appear in a public signature, so unlike the
// abort typings these are NOT barrel-exported. Same recipe as ./abort.ts:
// library programs carry zero ambient platform types (docs/decisions.md §39),
// so the platform `EventTarget`/`Event` values are pulled off `globalThis`
// re-typed against the minimal member set this module actually uses. The event
// carries its registration's DELTA (`set`) plus the token's accumulated `merges`
// so a listener installs only the new members.
interface AugmentEvent {
  readonly type: string;
  set: AugmentationSet<any>;
  merges: MergeStrategies;
}
interface NotifyEventTarget {
  addEventListener(type: string, listener: (event: AugmentEvent) => void): void;
  dispatchEvent(event: AugmentEvent): boolean;
}
const { EventTarget, Event } = globalThis as unknown as {
  EventTarget: Ctor<[], NotifyEventTarget>;
  Event: Ctor<[type: string], { type: string; }>;
};

/** A receiver-first augmentation function whose receiver type is erased in the bag. */
type ExtensionFn = Func<[receiver: never, ...args: never[]], unknown>;

/**
 * The accumulated bag per token. `members` is a per-NAME list of contributions
 * (§73/3): a name registered by two sets accumulates BOTH, replayed in
 * registration order during a late class's catch-up so it collides exactly as a
 * class present for both dispatches would. `merges` are the token's accumulated
 * collision strategies, consulted at every install.
 */
interface Bag {
  readonly members: Map<string, ExtensionFn[]>;
  readonly merges: MergeStrategies;
}

/** One accumulated bag per token. */
const bags = new Map<Token, Bag>();

/** The notify bus. The dispatched event's `type` IS the token string. */
const bus = new EventTarget();

/**
 * Append `set`'s members into `token`'s bag and record any collision strategies,
 * then dispatch a DELTA event so every class already decorated with
 * `@augment(token)` installs JUST these members.
 *
 * Registering a member name a prior set already contributed does NOT throw here
 * (§73/3) -- the bag holds a list per name and the two contributions accumulate.
 * The throw for an UNRESOLVED collision lives entirely at install time
 * (`installMember`): mounting the second contribution finds the name taken and,
 * without a `merge` strategy, refuses. With one, the two chain.
 */
export function registerAugmentations<R>(
  token: Token,
  set: AugmentationSet<R>,
  merge?: MergeStrategies,
): void {
  let bag = bags.get(token);
  if (bag === undefined) {
    bag = { members: new Map(), merges: {} };
    bags.set(token, bag);
  }
  for (const [name, fn] of Object.entries(set as Record<string, ExtensionFn>)) {
    const list = bag.members.get(name);
    if (list === undefined) {
      bag.members.set(name, [fn]);
    } else {
      list.push(fn);
    }
  }
  if (merge !== undefined) {
    Object.assign(bag.merges, merge);
  }

  // Dispatch ONLY this registration's delta. `merges` is the token's accumulated
  // strategy map (already including this call's `merge`), so a colliding member
  // finds its resolver whichever call supplied it.
  const event = new Event(token) as AugmentEvent;
  event.set = set as AugmentationSet<any>;
  event.merges = bag.merges;
  bus.dispatchEvent(event);
}

/**
 * Class decorator: install `token`'s augmentations onto the decorated class's
 * prototype. On application it catches up on everything registered SO FAR (once
 * each); thereafter its listener installs ONLY each later registration's delta.
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
  return function installOnClass<C extends { readonly prototype: object; }>(
    Ctor: C,
    // `unknown` (not `ClassDecoratorContext`): the context type TS synthesizes
    // for a private-constructor class fails ClassDecoratorContext's own
    // constructor-signature constraint, so naming the type here would reject
    // exactly the singleton receivers the widened `C` admits.
    _context?: unknown,
  ): void {
    const target = Ctor as unknown as Ctor<any[], any>;

    // Future registrations: install ONLY the dispatched delta (never the whole
    // accumulated bag) -- so each later member reaches this prototype once.
    bus.addEventListener(token, function(event: AugmentEvent) {
      installSet(target, event.set, event.merges);
    });

    // Catch-up: install everything registered BEFORE this class was decorated,
    // exactly once, replaying each name's contributions in registration order so
    // an accumulated same-name pair collides here just as it would at dispatch.
    const bag = bags.get(token);
    if (bag !== undefined) {
      for (const [name, list] of bag.members) {
        for (const fn of list) {
          installSet(target, { [name]: fn } as AugmentationSet<any>, bag.merges);
        }
      }
    }
  };
}
