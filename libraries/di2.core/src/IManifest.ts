// DO NOT ADD MEMBERS TO THE TYPES IN THIS FILE

import { augment, IterableObject } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { ServiceDescriptor } from './ServiceDescriptor';

export interface IManifest<Scopes extends string = string> extends Iterable<ServiceDescriptor<Scopes>> {
  add(descriptor: ServiceDescriptor<Scopes>): IManifest<Scopes>;
  remove(descriptor: ServiceDescriptor<Scopes>): IManifest<Scopes>;
  replace(descriptor: ServiceDescriptor<Scopes>): IManifest<Scopes>;
}

export interface Manifest<Scopes extends string = string> extends IManifest<Scopes> {}

@augment(tokenfor<IManifest>())
export class Manifest<Scopes extends string> implements IManifest<Scopes> {
  #descriptors: Iterable<ServiceDescriptor<Scopes>>;
  constructor(descriptors?: Iterable<ServiceDescriptor<Scopes>>) {
    this.#descriptors = descriptors ?? [];
  }
  add(descriptor: ServiceDescriptor<Scopes>) {
    function* added(this: Manifest<Scopes>) {
      // INTENTIONAL: newest first.
      yield descriptor;
      yield* this.#descriptors;
    }
    // A bound generator FUNCTION per iteration, never a generator object: the manifest is
    // iterated many times per resolution, and a stored generator object is spent after one pass.
    return new Manifest({ [Symbol.iterator]: added.bind(this) });
  }

  remove(descriptor: ServiceDescriptor<Scopes>) {
    function* removed(this: Manifest<Scopes>) {
      const it = Iterator.from(this.#descriptors);
      for (const existing of it) {
        if (ServiceDescriptor.equals(existing, descriptor)) {
          yield* it;
        } else {
          yield existing;
        }
      }
    }
    return new Manifest({ [Symbol.iterator]: removed.bind(this) });
  }

  replace(descriptor: ServiceDescriptor<Scopes>) {
    function* replaced(this: Manifest<Scopes>) {
      const it = Iterator.from(this.#descriptors);
      for (const existing of it) {
        if (ServiceDescriptor.matches(existing, descriptor)) {
          yield descriptor;
          yield* it;
        } else {
          yield existing;
        }
      }
    }
    return new Manifest({ [Symbol.iterator]: replaced.bind(this) });
  }

  [Symbol.iterator]() {
    return this.#descriptors[Symbol.iterator]();
  }

  static #empty = new Manifest<any>();
  static empty<Scopes extends string>(): IManifest<Scopes> {
    return this.#empty;
  }
}
