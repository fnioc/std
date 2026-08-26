import { type Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';

/** A registration that can serve a request, and what the match captured to make it fit. */
export interface Match {
  /** The registration as authored — an open one still holds its holes. */
  readonly registration: Registration<unknown>;
  /** One binding per hole the match filled; empty for a registration that had none. */
  readonly generics: ReadonlyMap<string, Type>;
}

/**
 * The registrations read for resolution: which of them match a request, newest first.
 */
export class Registry {
  readonly #registrations: ReadonlyArray<Registration<unknown>>;

  constructor(registrations: Iterable<Registration<unknown>>) {
    this.#registrations = Iterator.from(registrations).map(registration => Object.freeze(registration)).toArray();
  }

  /**
   * Every address a closed registration answers — what a whole-registry check has to walk, since
   * an open registration has no request to close its holes against.
   */
  get closedAddresses(): ReadonlySet<Type> {
    return new Set(
      Iterator.from(this.#registrations)
        .map(registration => registration.address)
        .filter(address => !Type.isOpen(address)),
    );
  }

  /**
   * Every registration matching exactly {@link address}'s own address, newest first — a
   * closed registration by interned identity, an open one by unification.
   */
  matching(address: Type): IteratorObject<Match, undefined> {
    return Iterator.from(this.#registrations)
      .map(registration => ({
        registration,
        bound: Type.bindGenerics(registration.address, address),
      }))
      .filter((candidate): candidate is { registration: Registration<unknown>; bound: [true, Map<string, Type>]; } => candidate.bound[0])
      .map(({ registration, bound: [, generics] }) => ({ registration, generics }));
  }
}
