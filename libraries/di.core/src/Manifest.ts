// DO NOT ADD MEMBERS TO THE TYPES IN THIS FILE

import { augment } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
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
export interface Manifest<Scopes extends string> extends Iterable<ServiceDescriptor<Scopes>> {
  /** Prepends `descriptor`, ahead of every descriptor already in the chain. */
  _add(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
  /**
   * Swaps in `descriptor` for the first descriptor that occupies the same registration slot —
   * see {@link ServiceDescriptor.matches} — leaving every other descriptor untouched.
   */
  _replace(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
  /** Drops the descriptor that is {@link ServiceDescriptor.equals} to `descriptor`, if one is present. */
  _remove(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
}

export interface DefaultManifest<Scopes extends string> extends Manifest<Scopes> {}

@augment(typefor<Manifest<any>>())
export class DefaultManifest<Scopes extends string> {
  #descriptors: Iterable<ServiceDescriptor<Scopes>>;
  constructor(descriptors?: Iterable<ServiceDescriptor<Scopes>>) {
    this.#descriptors = descriptors ?? [];
  }

  _add(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes> {
    return new DefaultManifest<Scopes>({
      [Symbol.iterator]: function* added(this: DefaultManifest<Scopes>) {
        // INTENTIONAL: newest first.
        yield descriptor;
        yield* this.#descriptors;
      }.bind(this),
    });
  }

  _remove(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes> {
    return new DefaultManifest<Scopes>({
      [Symbol.iterator]: function* removed(this: DefaultManifest<Scopes>) {
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

  _replace(descriptor: ServiceDescriptor<Scopes>) {
    return new DefaultManifest<Scopes>({
      [Symbol.iterator]: function* replaced(this: DefaultManifest<Scopes>) {
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

  static #empty = new DefaultManifest<any>();
  static empty<Scopes extends string>(): Manifest<Scopes> {
    return this.#empty;
  }
}
