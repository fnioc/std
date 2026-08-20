import { type Manifest, type ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';

/** A registration paired with its place in the manifest's newest-first order. */
interface Entry {
  readonly descriptor: ServiceDescriptor<string>;
  readonly rank: number;
}

/** A registration that can serve a request, and what the match captured to make it fit. */
export interface Answer {
  /** The registration as authored — an open one still holds its holes. */
  readonly descriptor: ServiceDescriptor<string>;
  /** The address answered: {@link descriptor}'s service type, closed over {@link generics}. */
  readonly serviceType: Type;
  /** One binding per hole the match filled; empty for a registration that had none. */
  readonly generics: ReadonlyMap<string, Type>;
}

/** An {@link Answer} carrying the registration order the registry sorts by. */
interface RankedAnswer extends Answer {
  readonly rank: number;
}

const NO_GENERICS: ReadonlyMap<string, Type> = new Map();

/**
 * A manifest indexed for resolution: which registrations answer a request, newest first.
 *
 * @remarks
 * Registrations partition once, when the registry is built. A CLOSED registration names a fixed
 * address, so the interned node it was registered under is its index key and a request reaches it
 * by identity — it never enters the match walk. An OPEN registration names a family instead, so it
 * is matched against each request to learn what its holes capture. Both come back out of
 * {@link answering} as one kind of {@link Answer} in one order, so which side a registration fell
 * on never shows.
 */
export class Registry {
  readonly #closed = new Map<Type, Entry[]>();
  readonly #open: Entry[] = [];

  constructor(manifest: Manifest<any>) {
    let rank = 0;
    for (const descriptor of manifest) {
      const entry: Entry = { descriptor, rank: rank++ };
      if (Type.isOpen(descriptor.serviceType)) {
        this.#open.push(entry);
      } else {
        this.#closed.getOrInsert(descriptor.serviceType, []).push(entry);
      }
    }
  }

  /**
   * Every address a closed registration answers, newest registration first — what a whole-manifest
   * check has to walk, since an open registration has no request to close its holes against.
   */
  get closedAddresses(): Iterable<Type> {
    return this.#closed.keys();
  }

  /** Every registration that can serve {@link request}, newest first. */
  *answering(request: Type): Generator<Answer> {
    yield* [...this.#closedAnswers(request), ...this.#openAnswers(request)]
      .sort((left, right) => left.rank - right.rank);
  }

  /**
   * A closed address answers by identity. A union is the one request it also answers without being
   * identical to it: a union asks which of several types is meant, so a registration for any
   * member is an answer to the whole.
   */
  *#closedAnswers(request: Type): Generator<RankedAnswer> {
    yield* this.#registeredAt(request);
    if (request.kind === 'union') {
      for (const member of request.members) {
        yield* this.#registeredAt(member);
      }
    }
  }

  *#registeredAt(address: Type): Generator<RankedAnswer> {
    for (const entry of this.#closed.get(address) ?? []) {
      yield { descriptor: entry.descriptor, serviceType: address, generics: NO_GENERICS, rank: entry.rank };
    }
  }

  /**
   * The registration is the PATTERN side and must extend the request — its value has to be usable
   * AS the requested type — with its holes capturing the request's fragments, so `Box<%T>` serves
   * `Box<Foo>` closed over `T := Foo`.
   */
  *#openAnswers(request: Type): Generator<RankedAnswer> {
    for (const entry of this.#open) {
      const [matched, generics] = Type.match(entry.descriptor.serviceType, request);
      if (matched) {
        yield {
          descriptor: entry.descriptor,
          serviceType: Type.substitute(entry.descriptor.serviceType, generics),
          generics,
          rank: entry.rank,
        };
      }
    }
  }
}
