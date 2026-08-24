import { type ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';

/** A registration that can serve a request, and what the match captured to make it fit. */
export interface Answer {
  /** The registration as authored — an open one still holds its holes. */
  readonly descriptor: ServiceDescriptor<unknown>;
  /** One binding per hole the match filled; empty for a registration that had none. */
  readonly generics: ReadonlyMap<string, Type>;
}

/**
 * The registrations read for resolution: which of them answer a request, newest first.
 *
 * @remarks
 * A CLOSED registration names a fixed address and answers a request it is interned-identical to.
 * An OPEN registration names a family instead, so it is matched against the request to learn what
 * its holes capture. Both come back out of {@link answering} as one kind of {@link Answer} in one
 * order, so which kind a registration is never shows.
 */
export class Registry {
  /** The transfer out of the authoring structure: one flat frozen snapshot, newest first. */
  readonly #descriptors: ReadonlyArray<ServiceDescriptor<unknown>>;

  constructor(descriptors: Iterable<ServiceDescriptor<unknown>>) {
    this.#descriptors = Iterator.from(descriptors).map(descriptor => Object.freeze(descriptor)).toArray();
  }

  /**
   * Every address a closed registration answers — what a whole-registry check has to walk, since
   * an open registration has no request to close its holes against.
   */
  get closedAddresses(): ReadonlySet<Type> {
    return new Set(
      Iterator.from(this.#descriptors)
        .map(descriptor => descriptor.serviceType)
        .filter(serviceType => !Type.isOpen(serviceType)),
    );
  }

  /**
   * Every registration answering exactly {@link serviceType}'s own address, newest first — a
   * closed registration by interned identity, an open one by unification.
   */
  answering(serviceType: Type): IteratorObject<Answer, undefined> {
    return Iterator.from(this.#descriptors)
      .map(descriptor => ({
        descriptor,
        match: Type.bindGenerics(descriptor.serviceType, serviceType),
      }))
      .filter((candidate): candidate is { descriptor: ServiceDescriptor<unknown>; match: [true, Map<string, Type>]; } => candidate.match[0])
      .map(({ descriptor, match: [, generics] }) => ({ descriptor, generics }));
  }
}
