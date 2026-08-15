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

import type { Ctor, Func } from '@rhombus-toolkit/func';

import { Multimap } from '../Multimap.js';
import { Type } from '../Type/Type.js';
import { getOrCreate } from '../utils/map.js';
import { applyAugmentations, type AugmentationSet, type MergeStrategies,
  type MergeStrategy } from './apply-augmentations.js';

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
 */
type Bag = Multimap<string, Contribution>;

/** A subscribed class's installer for ONE registration's set. */
type DeltaInstaller = (set: AugmentationSet<any>, merge: MergeStrategies<any> | undefined) => void;

const bags = new Map<Type, Bag>();

/** Decorated-class installers per receiver type, in decoration order. */
const subscribers = new Map<Type, DeltaInstaller[]>();

/**
 * Append `set`'s members into `receiver`'s bag, then install just those members onto
 * every class already decorated with `@augment(receiver)`.
 *
 * The receiver is a type. A token string names one too and is read into it, so a
 * caller spelling either reaches the same bag.
 *
 * @remarks
 * A member name a prior set already contributed accumulates rather than throwing;
 * the collision is resolved (by a supplied `merge` strategy) or refused at install
 * time. Subscribers are invoked synchronously, so that refusal reaches this caller.
 *
 * @throws TypeParseError - when a string receiver does not spell a type.
 * @throws TypeError - when the receiver names a shape rather than a declaration.
 */
export function registerAugmentations<R>(receiver: Type | string, set: AugmentationSet<R>,
  merge?: MergeStrategies<R>): void {
  const type = receiverType(receiver);
  const bag = getOrCreate(bags, type, () => new Multimap());
  for (const [name, fn] of Object.entries(set as Record<string, AugmentationFn>)) {
    bag.add(name, [fn, merge?.[name]]);
  }

  const installers = subscribers.get(type);
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
 * @throws TypeParseError - when a string receiver does not spell a type.
 * @throws TypeError - when the receiver names a shape rather than a declaration.
 */
export function augment(receiver: Type | string) {
  const type = receiverType(receiver);
  return function installOnClass<C extends { readonly prototype: object; }>(Ctor: C, _context?: unknown): void {
    const target = Ctor as unknown as Ctor<any[], any>;

    const installers = getOrCreate(subscribers, type, () => []);
    installers.push(function(set: AugmentationSet<any>, merge: MergeStrategies<any> | undefined) {
      applyAugmentations(target, set, merge);
    });

    // Catch-up replays each name's contributions in registration order, so an
    // accumulated same-name pair collides here exactly as it would at dispatch.
    const bag = bags.get(type);
    if (bag !== undefined) {
      for (const [name, [fn, strategy]] of bag) {
        const merge = strategy !== undefined ? { [name]: strategy } : undefined;
        applyAugmentations(target, { [name]: fn } as AugmentationSet<any>, merge);
      }
    }
  };
}

/**
 * The bag key both doors index by.
 *
 * @remarks
 * A receiver has to be a type IDENTIFIER. Augmenting names the declaration whose prototype the
 * members land on; a union, a signature or an aggregate describes a shape instead, and there is no
 * declaration behind it to install onto — a bag under one could only ever sit empty.
 */
function receiverType(receiver: Type | string): Type {
  const type = typeof receiver === 'string' ? Type.from(receiver) : receiver;
  if (!Type.isIdentifier(type)) {
    throw new TypeError(
      `an augmentation receiver names a declaration, and \`${Type.stringify(type)}\` names a shape`,
    );
  }
  return type;
}
