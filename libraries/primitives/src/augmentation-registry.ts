// The augmentation registry: the install path for OPEN receiver interfaces —
// ServiceManifest, ConfigBuilder, ILoggingBuilder — that downstream packages
// extend after the concrete receiver class is already defined. A direct install
// at the class can't see those later extenders; the registry bridges them with a
// per-token subscriber list, so registration and decoration work in either order,
// any number of times.
//
// Every bundle MUST keep `@rhombus-std/primitives` external: an inlined copy forks
// these module-level Maps and silently splits the registry — a class decorated
// against one copy never sees augmentations registered against the other.

import type { Ctor, Func } from '@rhombus-toolkit/func';

import { type AugmentationSet, installSet, type MergeStrategies, type MergeStrategy } from './augmentations.js';
import { Multimap } from './Multimap.js';
import type { Token } from './Token.js';

/** A receiver-first augmentation function whose receiver type is erased in the bag. */
type ExtensionFn = Func<[receiver: never, ...args: never[]], unknown>;

/**
 * A member contribution: its augmentation function paired with the collision
 * strategy the same registration supplied for that name (if any).
 */
type Contribution = readonly [fn: ExtensionFn, merge?: MergeStrategy];

/**
 * A token's bag: a per-name list of contributions, so a name registered by two
 * sets accumulates both (replayed in registration order at a late class's catch-up).
 */
type Bag = Multimap<string, Contribution>;

/** A subscribed class's installer for ONE registration's set. */
type DeltaInstaller = (set: AugmentationSet<any>, merge: MergeStrategies | undefined) => void;

const bags = new Map<Token, Bag>();

/** Decorated-class installers per token, in decoration order. */
const subscribers = new Map<Token, DeltaInstaller[]>();

/**
 * Append `set`'s members into `token`'s bag, then install just those members onto
 * every class already decorated with `@augment(token)`.
 *
 * @remarks
 * A member name a prior set already contributed accumulates rather than throwing;
 * the collision is resolved (by a supplied `merge` strategy) or refused at install
 * time. Subscribers are invoked synchronously, so that refusal reaches this caller.
 */
export function registerAugmentations<R>(token: Token, set: AugmentationSet<R>, merge?: MergeStrategies): void {
  let bag = bags.get(token);
  if (bag === undefined) {
    bag = new Multimap();
    bags.set(token, bag);
  }
  for (const [name, fn] of Object.entries(set as Record<string, ExtensionFn>)) {
    bag.add(name, [fn, merge?.[name]]);
  }

  const installers = subscribers.get(token);
  if (installers !== undefined) {
    for (const install of installers) {
      install(set as AugmentationSet<any>, merge);
    }
  }
}

/**
 * Class decorator that installs `token`'s augmentations onto the decorated class's
 * prototype: on application it catches up on everything registered so far, and
 * thereafter installs each later registration's delta. Usable as `@augment(TOKEN)`
 * or as a plain `augment(TOKEN)(TheClass)`.
 *
 * @remarks
 * The receiver constraint is `{ prototype: object }`, not a constructor signature,
 * so a class with a private constructor (a singleton) — assignable to no
 * `new (...) => ...` type — can still be a receiver; only its prototype is touched.
 */
export function augment(token: Token) {
  return function installOnClass<C extends { readonly prototype: object; }>(Ctor: C, _context?: unknown): void {
    const target = Ctor as unknown as Ctor<any[], any>;

    let installers = subscribers.get(token);
    if (installers === undefined) {
      installers = [];
      subscribers.set(token, installers);
    }
    installers.push(function(set: AugmentationSet<any>, merge: MergeStrategies | undefined) {
      installSet(target, set, merge);
    });

    // Catch-up replays each name's contributions in registration order, so an
    // accumulated same-name pair collides here exactly as it would at dispatch.
    const bag = bags.get(token);
    if (bag !== undefined) {
      for (const [name, [fn, strategy]] of bag) {
        const merge = strategy !== undefined ? { [name]: strategy } : undefined;
        installSet(target, { [name]: fn } as AugmentationSet<any>, merge);
      }
    }
  };
}
