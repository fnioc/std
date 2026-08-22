import { type Manifest, type ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';

/** A registration that can serve a request, and what the match captured to make it fit. */
export interface Answer {
  /** The registration as authored — an open one still holds its holes. */
  readonly descriptor: ServiceDescriptor<unknown>;
  /** The address answered: {@link descriptor}'s service type, closed over {@link generics}. */
  readonly serviceType: Type;
  /** One binding per hole the match filled; empty for a registration that had none. */
  readonly generics: ReadonlyMap<string, Type>;
}

const NO_GENERICS: ReadonlyMap<string, Type> = new Map();

/**
 * A manifest read for resolution: which registrations answer a request, newest first.
 *
 * @remarks
 * A CLOSED registration names a fixed address and answers a request it is interned-identical to.
 * An OPEN registration names a family instead, so it is matched against the request to learn what
 * its holes capture. Both come back out of {@link answering} as one kind of {@link Answer} in one
 * order, so which kind a registration is never shows.
 */
export class Registry {
  readonly #manifest: Manifest<any>;

  constructor(manifest: Manifest<any>) {
    this.#manifest = manifest;
  }

  /**
   * Every address a closed registration answers — what a whole-manifest check has to walk, since
   * an open registration has no request to close its holes against.
   */
  get closedAddresses(): Iterable<Type> {
    const addresses = new Set<Type>();
    for (const descriptor of this.#manifest) {
      if (!Type.isOpen(descriptor.serviceType)) {
        addresses.add(descriptor.serviceType);
      }
    }
    return addresses;
  }

  /**
   * Every registration answering exactly {@link serviceType}'s own address, newest first — a
   * closed registration by interned identity, an open one by unification.
   */
  *answering(serviceType: Type): Generator<Answer, void, unknown> {
    for (const descriptor of this.#manifest) {
      const proposedServiceType = descriptor.serviceType;
      if (Type.isOpen(proposedServiceType)) {
        const [isMatch, generics] = Type.match(proposedServiceType, serviceType);
        if (isMatch) {
          yield { descriptor, serviceType: Type.substitute(proposedServiceType, generics), generics };
        }
      } else if (proposedServiceType === serviceType) {
        yield { descriptor, serviceType: proposedServiceType, generics: NO_GENERICS };
      }
    }
  }
}
