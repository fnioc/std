// DO NOT ADD MEMBERS TO THE TYPES IN THIS FILE

import { augment, IterableObject } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import { ServiceDescriptor } from './ServiceDescriptor';

export interface IManifest<Scopes extends string = string> extends IterableObject<ServiceDescriptor<Scopes>> {
  add(descriptor: ServiceDescriptor<Scopes>): IManifest<Scopes>;
}

export interface Manifest<Scopes extends string = string> extends IManifest<Scopes> {}

@augment(tokenfor<IManifest>())
export class Manifest<Scopes extends string> implements IManifest<Scopes> {
  #descriptors: Iterable<ServiceDescriptor<Scopes>>;
  constructor(descriptors?: Iterable<ServiceDescriptor<Scopes>>) {
    this.#descriptors = descriptors ?? [];
  }
  add(descriptor: ServiceDescriptor<Scopes>) {
    // INTENTIONAL: newest first. The chain yields most-recent-registration-first so
    // that taking the FIRST match of a filtered scan is what makes a later
    // registration beat an earlier one for the same type.
    function* added(this: Manifest<Scopes>) {
      yield descriptor;
      yield* this.#descriptors;
    }
    return new Manifest(added.call(this));
  }

  // this is yielded instead of directly returning to ensure it returns an Iterator prototyped object, thus ensure the Iterator comprehension methods.
  *[Symbol.iterator]() {
    yield* this.#descriptors;
  }
}
