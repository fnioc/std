import type { Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { isDefined } from '@rhombus-toolkit/type-guards';

/** A registration that can serve a request, and what the match captured to make it fit. */
export interface Match {
  /** The registration as authored — an open one still holds its holes. */
  readonly registration: Registration<unknown>;
  /** One binding per hole the match filled; empty for a registration that had none. */
  readonly generics: Readonly<Record<string, Type>>;
  /** The address it was matched against, which is the address this match answers. */
  readonly address: Type;
  /** The registration's position among the registrations, newest first — where a search for what it shadows starts after. */
  readonly index: number;
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
   * Every registration matching {@link primary} or {@link alternate}, newest first — one pass
   * over the registrations, so a registration matching both is answered once under
   * {@link primary}. A closed registration matches by interned identity, an open one by unification.
   *
   * @param start - the position to search from; a registration resolving a slot naming its own
   * address passes its own position plus one, so only what it shadows can answer.
   */
  getMatches(primary: Type, alternate?: Type, start = 0) {
    return Iterator.from(this.#registrations)
      .drop(start)
      .map((registration, dropped): Match | undefined => {
        const index = start + dropped;
        const [isMatch, generics] = Type.bindGenerics(registration.address, primary);
        if (isMatch) {
          return { registration, generics, address: primary, index };
        }
        if (alternate !== undefined) {
          const [isAlternateMatch, alternateGenerics] = Type.bindGenerics(registration.address, alternate);
          if (isAlternateMatch) {
            return { registration, generics: alternateGenerics, address: alternate, index };
          }
        }
        return undefined;
      })
      .filter(isDefined);
  }

  /** Whether any registration matches `address` — an open address never is, since a hole on the asking side binds nothing. */
  hasMatch(address: Type): boolean {
    return Type.isClosed(address)
      && this.#registrations.some(registration => Type.bindGenerics(registration.address, address)[0]);
  }
}
