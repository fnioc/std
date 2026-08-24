// DO NOT ADD MEMBERS TO THE TYPES IN THIS FILE

import { augment, concat } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';
import { ServiceDescriptor } from './ServiceDescriptor';

/**
 * An immutable registration ledger: an iterable chain of {@link ServiceDescriptor}s. Every
 * registration verb returns a NEW manifest rather than mutating the receiver, so a discarded
 * result registers nothing.
 *
 * @remarks
 * `add`/`remove`/`replace` are the substrate every other registration verb composes from; each
 * also carries sugared shapes contributed by augmentation. Iterating a manifest yields its
 * descriptors newest-registration-first. A verb that changes nothing returns the receiver
 * itself, so `===` answers "did this change anything" and an unchanged manifest keeps its
 * cached plans.
 */
export interface Manifest<Lifetime> extends Iterable<ServiceDescriptor<Lifetime>> {
  /** Prepends `descriptor`, ahead of every descriptor already in the chain. */
  _add(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime>;
  /**
   * Swaps in `descriptor` for the first descriptor registered under the same service type, leaving
   * every other descriptor untouched.
   */
  _replace(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime>;
  /** Drops the descriptor that is {@link ServiceDescriptor.equals} to `descriptor`, if one is present. */
  _remove(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime>;
}

export interface DefaultManifest<Lifetime> extends Manifest<Lifetime> {}

@augment(typefor<Manifest<unknown>>())
export class DefaultManifest<Lifetime> implements Manifest<Lifetime> {
  readonly [Symbol.iterator]!: Func<[], Iterator<ServiceDescriptor<Lifetime>>>;

  constructor();
  constructor(descriptors: Iterable<ServiceDescriptor<Lifetime>>);
  constructor(generator: Func<[], Iterator<ServiceDescriptor<Lifetime>>>);
  constructor(arg: Iterable<ServiceDescriptor<Lifetime>> | Func<[], Iterator<ServiceDescriptor<Lifetime>>> = []) {
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

  _add(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime> {
    return new DefaultManifest<Lifetime>(() => concat(descriptor, this));
  }

  _remove(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime> {
    if (!Iterator.from(this).some(existing => ServiceDescriptor.equals(existing, descriptor))) {
      return this;
    }
    return new DefaultManifest<Lifetime>(
      function* removed(this: DefaultManifest<Lifetime>) {
        const it = Iterator.from(this);
        for (const existing of it) {
          if (ServiceDescriptor.equals(existing, descriptor)) {
            yield* it;
          } else {
            yield existing;
          }
        }
      }.bind(this),
    );
  }

  _replace(descriptor: ServiceDescriptor<Lifetime>) {
    if (!Iterator.from(this).some(existing => existing.serviceType === descriptor.serviceType)) {
      return this;
    }
    return new DefaultManifest<Lifetime>(
      function* replaced(this: DefaultManifest<Lifetime>) {
        const it = Iterator.from(this);
        for (const existing of it) {
          if (existing.serviceType === descriptor.serviceType) {
            yield descriptor;
            yield* it;
          } else {
            yield existing;
          }
        }
      }.bind(this),
    );
  }

  static empty<Lifetime>(): Manifest<Lifetime> {
    return new DefaultManifest<Lifetime>();
  }
}
