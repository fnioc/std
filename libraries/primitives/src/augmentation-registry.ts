// The augmentation REGISTRY -- the OPEN-set install path (docs/decisions.md §38,
// §79, building on the §28 authoring shape).
//
// CLOSED sets (receiver interface AND all its augmentations owned inside one
// family's own `.core`) keep the direct `applyAugmentations` call at the
// concrete class definition -- no token, no registry. OPEN builder interfaces
// (ServiceManifest, ConfigBuilder, ILoggingBuilder, ...) are extended by
// DOWNSTREAM packages that load after the concrete class is already defined, so
// a one-shot install cannot see them. The registry closes that gap with a plain
// per-token SUBSCRIBER LIST -- NO EventTarget, NO Proxy, NO observable/Subject:
//
//   - `registerAugmentations(token, set, merge?)` -- each extender package calls
//     this at import time, beside its `declare module` type merge. It appends
//     `set`'s members into the token's bag (a per-name list -- a second same-name
//     registration accumulates, it does NOT throw here, §79), records any
//     `merge` strategies, then drives JUST this set onto every class already
//     subscribed to the token by calling each subscriber SYNCHRONOUSLY.
//   - `augment(token)` -- a class decorator on the concrete receiver class. On
//     first application it installs the token's currently-accumulated members
//     ONCE (catch-up for anything registered before the class was decorated),
//     and subscribes a delta installer that installs ONLY each later
//     registration's own set -- never the whole bag again.
//
// A plain synchronous subscriber list (not an `EventTarget` bus) is load-bearing
// for the collision throw (§79): a delta install that hits a taken
// name with no `merge` strategy THROWS from `installMember`, and that throw must
// reach the `registerAugmentations` caller so the colliding member is refused,
// not silently dropped. `EventTarget.dispatchEvent` SWALLOWS a listener's
// exception (it is reported out-of-band as an uncaughtException, never
// propagated to the dispatcher), so an already-decorated class's genuine
// collision would return normally and drop the member. Iterating the
// subscribers directly lets the throw propagate synchronously to the registrant.
//
// DELTA INSTALL (docs §79) is the core of the design. The old listener
// re-installed the ENTIRE accumulated bag on every dispatch, so a member on a
// heavily-shared token (eight config providers all register onto
// `nameof<IConfigBuilder>()`) was re-installed once per later
// registration. Now a member reaches a given prototype exactly ONCE: the
// catch-up pull covers members registered before decoration, and each
// registration installs only its own set. Double-installs are impossible by
// construction, so the install path (`installMember`) needs no idempotency
// bookkeeping -- a second arrival at a taken name is a genuine collision (§79).
//
// Registration and decoration may happen in either order and any number of
// times.
//
// Runtime-identity invariant (§9/§38): every bundle MUST keep
// `@rhombus-std/primitives` EXTERNAL. Inlining a private copy forks these Maps,
// and the registry silently splits -- a class decorated against one copy never
// sees augmentations registered against the other.

import type { Ctor, Func } from '@rhombus-toolkit/func';

import { type AugmentationSet, installSet, type MergeStrategies, type MergeStrategy } from './augmentations.js';
import { Multimap } from './Multimap.js';
import type { Token } from './Token.js';

/** A receiver-first augmentation function whose receiver type is erased in the bag. */
type ExtensionFn = Func<[receiver: never, ...args: never[]], unknown>;

/**
 * One contribution to a member name: the augmentation function paired with the
 * OWN collision strategy the registration supplied for it (if any). The strategy
 * travels WITH its function -- at install, a colliding contribution is resolved
 * by its own strategy, never a strategy some other contribution provided.
 */
type Contribution = readonly [fn: ExtensionFn, merge?: MergeStrategy];

/**
 * The accumulated bag per token: a per-NAME list of {@link Contribution}s
 * (§79). A name registered by two sets accumulates BOTH, replayed in
 * registration order during a late class's catch-up so it collides exactly as a
 * class present for both dispatches would. The `[fn, merge?]` tuple carries each
 * contribution's own strategy, so the two parallel structures (a name->fn-list
 * plus a name->strategy map) collapse into a single {@link Multimap}.
 */
type Bag = Multimap<string, Contribution>;

/**
 * A subscribed class's delta installer: given ONE registration's `set` (plus the
 * per-member `merge` strategies that same registration supplied), install just
 * those members onto that class's prototype. Invoked synchronously by
 * `registerAugmentations`, so a collision throw propagates back to the registrant.
 */
type DeltaInstaller = (set: AugmentationSet<any>, merge: MergeStrategies | undefined) => void;

/** One accumulated bag per token. */
const bags = new Map<Token, Bag>();

/** The subscribers (decorated classes) per token, in decoration order. */
const subscribers = new Map<Token, DeltaInstaller[]>();

/**
 * Append `set`'s members into `token`'s bag and record any collision strategies,
 * then drive a DELTA install onto every class already decorated with
 * `@augment(token)` -- JUST these members, synchronously.
 *
 * Registering a member name a prior set already contributed does NOT throw here
 * (§79) -- the bag holds a list per name and the two contributions accumulate.
 * The throw for an UNRESOLVED collision lives entirely at install time
 * (`installMember`): mounting the second contribution finds the name taken and,
 * without a `merge` strategy, refuses. With one, the two chain. Because the
 * subscribers are called synchronously (not through an `EventTarget` bus, whose
 * `dispatchEvent` would swallow the throw, §79), that refusal propagates to this
 * caller instead of silently dropping the member.
 */
export function registerAugmentations<R>(
  token: Token,
  set: AugmentationSet<R>,
  merge?: MergeStrategies,
): void {
  let bag = bags.get(token);
  if (bag === undefined) {
    bag = new Multimap();
    bags.set(token, bag);
  }
  // Append each member as a `[fn, ownStrategy]` contribution: the strategy this
  // registration supplied for the name travels with its function into the bag.
  for (const [name, fn] of Object.entries(set as Record<string, ExtensionFn>)) {
    bag.add(name, [fn, merge?.[name]]);
  }

  // Drive ONLY this registration's delta onto every already-decorated class,
  // with this registration's OWN strategies (`installSet` reads `merge?.[name]`
  // per member). Synchronous, so a strategy-less collision throw reaches here.
  const installers = subscribers.get(token);
  if (installers !== undefined) {
    for (const install of installers) {
      install(set as AugmentationSet<any>, merge);
    }
  }
}

/**
 * Class decorator: install `token`'s augmentations onto the decorated class's
 * prototype. On application it catches up on everything registered SO FAR (once
 * each); thereafter its subscriber installs ONLY each later registration's delta.
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

    // Future registrations: install ONLY the delta driven by each later
    // `registerAugmentations` (never the whole accumulated bag) -- so each later
    // member reaches this prototype once.
    let installers = subscribers.get(token);
    if (installers === undefined) {
      installers = [];
      subscribers.set(token, installers);
    }
    installers.push(function(set: AugmentationSet<any>, merge: MergeStrategies | undefined) {
      installSet(target, set, merge);
    });

    // Catch-up: install everything registered BEFORE this class was decorated,
    // exactly once, replaying each name's contributions in registration order so
    // an accumulated same-name pair collides here just as it would at dispatch.
    // Each contribution carries its own strategy, so a colliding member resolves
    // by the strategy that came with it.
    const bag = bags.get(token);
    if (bag !== undefined) {
      for (const [name, [fn, strategy]] of bag) {
        const merge = strategy !== undefined ? { [name]: strategy } : undefined;
        installSet(target, { [name]: fn } as AugmentationSet<any>, merge);
      }
    }
  };
}
