// DO NOT ADD MEMBERS TO THE TYPES IN THIS FILE

import { augment } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { Func } from '@rhombus-toolkit/func';
import { concat } from '@rhombus-toolkit/obj';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { Registration } from './Registration';

/**
 * An immutable registration ledger: an iterable chain of {@link Registration}s. Every
 * registration verb returns a NEW manifest rather than mutating the receiver, so a discarded
 * result registers nothing.
 *
 * @remarks
 * `add`/`remove`/`replace` are the substrate every other registration verb composes from; each
 * also carries sugared shapes contributed by augmentation. Iterating a manifest yields its
 * registrations newest-registration-first. A verb that changes nothing returns the receiver
 * itself, so `===` answers "did this change anything" and an unchanged manifest keeps its
 * cached plans.
 */
export interface Manifest<Lifetime> extends Iterable<Registration<Lifetime>> {
  /** Prepends `registration`, ahead of every registration already in the chain. */
  _add(registration: Registration<Lifetime>): Manifest<Lifetime>;
  /**
   * Swaps in `registration` for the first registration registered under the same service type, leaving
   * every other registration untouched.
   */
  _replace(registration: Registration<Lifetime>): Manifest<Lifetime>;
  /** Drops the registration that is {@link Registration.equals} to `registration`, if one is present. */
  _remove(registration: Registration<Lifetime>): Manifest<Lifetime>;
}
export namespace Manifest {
  export function empty<Lifetime>(): Manifest<Lifetime> {
    return new DefaultManifest<Lifetime>();
  }

  /** The registrations `fn` composes onto an empty manifest. */
  export function build<Lifetime>(fn: Func<[Manifest<Lifetime>], Iterable<Registration<Lifetime>>>): Iterable<Registration<Lifetime>> {
    return fn(empty<Lifetime>());
  }
}
export interface DefaultManifest<Lifetime> extends Manifest<Lifetime> {}

@augment(typefor<Manifest<unknown>>())
export class DefaultManifest<Lifetime> implements Manifest<Lifetime> {
  readonly [Symbol.iterator]!: Func<[], Iterator<Registration<Lifetime>>>;

  constructor();
  constructor(registrations: Iterable<Registration<Lifetime>>);
  constructor(generator: Func<[], Iterator<Registration<Lifetime>>>);
  constructor(arg: Iterable<Registration<Lifetime>> | Func<[], Iterator<Registration<Lifetime>>> = []) {
    this[Symbol.iterator] = (() => {
      switch (typeof arg) { // eslint-disable-line @typescript-eslint/switch-exhaustiveness-check
        case 'object':
          return () => arg[Symbol.iterator]();
        case 'function':
          return arg;
        default:
          return assertNever(arg);
      }
    })();
  }

  _add(registration: Registration<Lifetime>): Manifest<Lifetime> {
    return new DefaultManifest<Lifetime>(() => concat(registration, this));
  }

  _remove(registration: Registration<Lifetime>): Manifest<Lifetime> {
    if (!Iterator.from(this).some(existing => Registration.equals(existing, registration))) {
      return this;
    }
    return new DefaultManifest<Lifetime>(
      function* removed(this: DefaultManifest<Lifetime>) {
        const it = Iterator.from(this);
        for (const existing of it) {
          if (Registration.equals(existing, registration)) {
            yield* it;
          } else {
            yield existing;
          }
        }
      }.bind(this),
    );
  }

  _replace(registration: Registration<Lifetime>) {
    if (!Iterator.from(this).some(existing => existing.address === registration.address)) {
      return this;
    }
    return new DefaultManifest<Lifetime>(
      function* replaced(this: DefaultManifest<Lifetime>) {
        const it = Iterator.from(this);
        for (const existing of it) {
          if (existing.address === registration.address) {
            yield registration;
            yield* it;
          } else {
            yield existing;
          }
        }
      }.bind(this),
    );
  }
}
