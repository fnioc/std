// DO NOT ADD MEMBERS TO THE TYPES IN THIS FILE

import { augment, IterableObject } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { ServiceDescriptor } from './ServiceDescriptor';

export interface Manifest<Scopes extends string = any> extends Iterable<ServiceDescriptor<Scopes>> {
  add(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
  remove(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
  replace(descriptor: ServiceDescriptor<Scopes>): Manifest<Scopes>;
}

export interface DefaultManifest<Scopes extends string> extends Manifest<Scopes> {}

@augment(tokenfor<Manifest>())
export class DefaultManifest<Scopes extends string> implements Manifest<Scopes> {
  #descriptors: Iterable<ServiceDescriptor<Scopes>>;
  constructor(descriptors?: Iterable<ServiceDescriptor<Scopes>>) {
    this.#descriptors = descriptors ?? [];
  }
  add(descriptor: ServiceDescriptor<Scopes>) {
    return new DefaultManifest<Scopes>({
      [Symbol.iterator]: function* added(this: DefaultManifest<Scopes>) {
        // INTENTIONAL: newest first.
        yield descriptor;
        yield* this.#descriptors;
      }.bind(this),
    });
  }

  remove(descriptor: ServiceDescriptor<Scopes>) {
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

  replace(descriptor: ServiceDescriptor<Scopes>) {
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
