// The augmentation registry: the install path for OPEN receiver interfaces —
// ServiceManifest, ConfigBuilder, ILoggingBuilder — that downstream packages
// extend after the concrete receiver class is already defined. A direct install
// at the class can't see those later extenders; the registry bridges them with a
// per-receiver subscriber list, so registration and decoration work in either order,
// any number of times.
//
// Every bundle MUST keep `@rhombus-std/primitives` external: an inlined copy forks
// these module-level Maps and silently splits the registry — a class decorated
// against one copy never sees augmentations registered against the other.

import type { Ctor, Func } from '@rhombus-toolkit/types';

import { Type } from '../Type/index.js';
import { applyAugmentations, type AugmentationSet, type MergeStrategies, type MergeStrategy } from './apply-augmentations.js';

/** A `this`-based augmentation method whose receiver type is erased in the bag. */
type AugmentationFn = Func<never[], unknown>;

/**
 * A member contribution: its augmentation function paired with the collision
 * strategy the same registration supplied for that name (if any).
 */
type Contribution = readonly [fn: AugmentationFn, merge?: MergeStrategy<any>];

/**
 * A receiver's bag: a per-name list of contributions, so a name registered by two
 * sets accumulates both (replayed in registration order at a late class's catch-up).
 *
 * @remarks
 * Prototype-less at runtime — an augmented member may legally be named `toString` or
 * `constructor`, and a plain `{}` would answer those from the inherited method rather than the bag.
 */
type Bag = Record<string, Contribution[]>;

/** A subscribed class's installer for ONE registration's set. */
type DeltaInstaller = (set: AugmentationSet<any>, merge: MergeStrategies<any> | undefined) => void;

const bags = new Map<Type, Bag>();

/** Decorated-class installers per receiver type, in decoration order. */
const subscribers = new Map<Type, DeltaInstaller[]>();

/** @throws TypeError - when `receiver` names a shape rather than a declaration. */
function requireIdentifier(receiver: Type): void {
  if (Type.isIdentifier(receiver)) {
    return;
  }
  // Render whatever arrived without trusting it to be an interned node — the
  // message must survive the very input it is rejecting.
  let spelled: string;
  try {
    spelled = Type.stringify(receiver);
  } catch {
    spelled = String(receiver);
  }
  throw new TypeError(`an augmentation receiver names a declaration, and \`${spelled}\` names a shape`);
}

/**
 * Append `set`'s members into `receiver`'s bag, then install just those members onto
 * every class already decorated with `@augment(receiver)`.
 *
 * @remarks
 * Types intern, so every spelling of the receiver — `typefor<R>()`, a factory
 * composition, `Type.from` over a token string — reaches the same bag.
 *
 * A member name a prior set already contributed accumulates rather than throwing;
 * the collision is resolved (by a supplied `merge` strategy) or refused at install
 * time. Subscribers are invoked synchronously, so that refusal reaches this caller.
 *
 * @throws TypeError - when the receiver names a shape rather than a declaration.
 */
export function registerAugmentations<R>(receiver: Type, set: AugmentationSet<R>, merge?: MergeStrategies<R>): void {
  requireIdentifier(receiver);
  const bag = bags.getOrInsert(receiver, Object.create(null));
  for (const [name, fn] of Object.entries(set as Record<string, AugmentationFn>)) {
    (bag[name] ??= []).push([fn, merge?.[name]]);
  }

  const installers = subscribers.get(receiver);
  if (installers !== undefined) {
    for (const install of installers) {
      install(set as AugmentationSet<any>, merge);
    }
  }
}

/**
 * Class decorator that installs the augmentations registered for `receiver` onto the
 * decorated class's prototype: on application it catches up on everything registered
 * so far, and thereafter installs each later registration's delta. Usable as
 * `@augment(typefor<IReceiver>())` or as a plain `augment(receiver)(TheClass)`.
 *
 * @remarks
 * The class constraint is `{ prototype: object }`, not a constructor signature, so a
 * class with a private constructor (a singleton) — assignable to no
 * `new (...) => ...` type — can still be a receiver; only its prototype is touched.
 *
 * @throws TypeError - when the receiver names a shape rather than a declaration.
 */
export function augment(receiver: Type) {
  requireIdentifier(receiver);
  return function installOnClass<C extends { readonly prototype: object; }>(Ctor: C, _context?: unknown): void {
    const target = Ctor as unknown as Ctor<any[], any>;

    const installers = subscribers.getOrInsert(receiver, []);
    installers.push(function(set: AugmentationSet<any>, merge: MergeStrategies<any> | undefined) {
      applyAugmentations(target, set, merge);
    });

    // Catch-up replays each name's contributions in registration order, so an
    // accumulated same-name pair collides here exactly as it would at dispatch.
    const bag = bags.get(receiver);
    if (bag !== undefined) {
      for (const [name, contributions] of Object.entries(bag)) {
        for (const [fn, strategy] of contributions) {
          const merge = strategy !== undefined ? { [name]: strategy } : undefined;
          applyAugmentations(target, { [name]: fn } as AugmentationSet<any>, merge);
        }
      }
    }
  };
}
