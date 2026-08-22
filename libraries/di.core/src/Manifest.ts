// DO NOT ADD MEMBERS TO THE TYPES IN THIS FILE

import { augment } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { LifetimeModel } from './LifetimeModel';
import { ServiceDescriptor } from './ServiceDescriptor';

/**
 * An immutable registration ledger: an iterable chain of {@link ServiceDescriptor}s. Every
 * registration verb returns a NEW manifest rather than mutating the receiver, so a discarded
 * result registers nothing.
 *
 * @remarks
 * `add`/`remove`/`replace` are the substrate every other registration verb composes from; each
 * also carries sugared shapes contributed by augmentation. Iterating a manifest yields its
 * descriptors newest-registration-first.
 */
export interface Manifest<Lifetime> extends Iterable<ServiceDescriptor<Lifetime>> {
  /** The model interpreting every registration's lifetime datum when a provider built from here realizes. */
  readonly lifetimeModel: LifetimeModel<Lifetime>;
  /** Prepends `descriptor`, ahead of every descriptor already in the chain. */
  _add(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime>;
  /**
   * Swaps in `descriptor` for the first descriptor that occupies the same registration slot —
   * see {@link ServiceDescriptor.matches} — leaving every other descriptor untouched.
   */
  _replace(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime>;
  /** Drops the descriptor that is {@link ServiceDescriptor.equals} to `descriptor`, if one is present. */
  _remove(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime>;
}

export interface DefaultManifest<Lifetime> extends Manifest<Lifetime> {}

@augment(typefor<Manifest<any>>())
export class DefaultManifest<Lifetime> {
  #descriptors: Iterable<ServiceDescriptor<Lifetime>>;
  constructor(readonly lifetimeModel: LifetimeModel<Lifetime>, descriptors?: Iterable<ServiceDescriptor<Lifetime>>) {
    this.#descriptors = descriptors ?? [];
  }

  _add(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime> {
    return new DefaultManifest<Lifetime>(this.lifetimeModel, {
      [Symbol.iterator]: function* added(this: DefaultManifest<Lifetime>) {
        // INTENTIONAL: newest first.
        yield descriptor;
        yield* this.#descriptors;
      }.bind(this),
    });
  }

  _remove(descriptor: ServiceDescriptor<Lifetime>): Manifest<Lifetime> {
    return new DefaultManifest<Lifetime>(this.lifetimeModel, {
      [Symbol.iterator]: function* removed(this: DefaultManifest<Lifetime>) {
        const it = Iterator.from(this.#descriptors);
        for (const existing of it) {
          if (ServiceDescriptor.equals(existing, descriptor)) {
            yield* it;
          } else {
            yield existing;
          }
        }
      }.bind(this),
    });
  }

  _replace(descriptor: ServiceDescriptor<Lifetime>) {
    return new DefaultManifest<Lifetime>(this.lifetimeModel, {
      [Symbol.iterator]: function* replaced(this: DefaultManifest<Lifetime>) {
        const it = Iterator.from(this.#descriptors);
        for (const existing of it) {
          if (ServiceDescriptor.matches(existing, descriptor)) {
            yield descriptor;
            yield* it;
          } else {
            yield existing;
          }
        }
      }.bind(this),
    });
  }

  [Symbol.iterator]() {
    return this.#descriptors[Symbol.iterator]();
  }

  static empty<Lifetime>(lifetimeModel: LifetimeModel<Lifetime>): Manifest<Lifetime> {
    return new DefaultManifest<Lifetime>(lifetimeModel);
  }
}
