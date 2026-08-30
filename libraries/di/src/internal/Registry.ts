import type { Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';

/** A registration that can serve a request, and what the match captured to make it fit. */
export interface Match {
  /** The registration as authored — an open one still holds its holes. */
  readonly registration: Registration<unknown>;
  /** One binding per hole the match filled; empty for a registration that had none. */
  readonly generics: Readonly<Record<string, Type>>;
  /** The address it was matched against, which is the address this match answers. */
  readonly address: Type;
}

/**
 * The registrations read for resolution: which of them match a request, newest first.
 */
export class Registry {
  readonly #registrations: ReadonlyArray<Registration<unknown>>;

  constructor(registrations: Iterable<Registration<unknown>>) {
    this.#registrations = Iterator.from(registrations).map(registration => Object.freeze(registration)).toArray();
  }

  /** Every registration filed, newest first. */
  get registrations(): ReadonlyArray<Registration<unknown>> {
    return this.#registrations;
  }

  /**
   * Every address a closed registration answers — what a whole-registry check has to enumerate,
   * since an open registration has no request to close its holes against.
   */
  get closedAddresses(): ReadonlySet<Type> {
    return new Set(
      Iterator.from(this.#registrations)
        .map(registration => registration.address)
        .filter(Type.isClosed),
    );
  }

  /**
   * Every registration matching exactly {@link address}'s own address, newest first — a
   * closed registration by interned identity, an open one by unification.
   */
  getMatches(address: Type) {
    return this.getMatchesForEither(address);
  }

  /**
   * Every registration matching {@link primary} or {@link alternate}, newest first — one pass
   * over the registrations, so a registration matching both is answered once under
   * {@link primary}.
   */
  getMatchesForEither(primary: Type, alternate?: Type) {
    return Iterator.from(this.#registrations)
      .map(registration => getMatchOfEither(registration, primary, alternate))
      .filter(match => match !== undefined);
  }
}

/** The first of the two addresses that `registration` answers, absent when it answers neither. */
function getMatchOfEither(registration: Registration<unknown>, primary: Type, alternate: Type | undefined): Match | undefined {
  const [isMatch, generics] = Type.bindGenerics(registration.address, primary);
  if (isMatch) {
    return { registration, generics, address: primary };
  }
  if (alternate !== undefined) {
    const [isMatched2, generics2] = Type.bindGenerics(registration.address, alternate);
    if (isMatched2) {
      return { registration, generics: generics2, address: alternate };
    }
  }
  return undefined;
}
