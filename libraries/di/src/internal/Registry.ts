import { type Manifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { getOrCreate, Type } from '@rhombus-std/primitives';

/** A registration paired with its place in the manifest's newest-first order. */
interface Entry {
  readonly descriptor: ServiceDescriptor<string>;
  readonly rank: number;
}

/**
 * A manifest indexed for resolution: which registrations answer a request, newest first.
 *
 * @remarks
 * Registrations partition once, when the registry is built. A CLOSED registration names a fixed
 * address, so the interned node it was registered under is its index key and a request reaches it
 * by identity — it never enters the match walk. An OPEN registration names a family instead, so it
 * is matched against each request to learn what its holes capture. Both come back out of
 * {@link answering} in one order, so which side a registration fell on never shows.
 */
export class Registry {
  readonly #closed = new Map<Type, Entry[]>();
  readonly #open: Entry[] = [];

  constructor(manifest: Manifest) {
    let rank = 0;
    for (const descriptor of manifest) {
      const entry: Entry = { descriptor, rank: rank++ };
      if (Type.isOpen(descriptor.serviceType)) {
        this.#open.push(entry);
      } else {
        getOrCreate(this.#closed, descriptor.serviceType, () => []).push(entry);
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

  /**
   * Every registration that can serve {@link request}, newest first, each already closed over
   * whatever its match captured.
   */
  *answering(request: Type): Generator<ServiceDescriptor<string>> {
    const answers = [...this.#closedAnswers(request), ...this.#openAnswers(request)]
      .sort((left, right) => left.rank - right.rank);
    for (const answer of answers) {
      yield answer.descriptor;
    }
  }

  /**
   * A closed address answers by identity. A union is the one request it also answers without being
   * identical to it: a union asks which of several types is meant, so a registration for any
   * member is an answer to the whole.
   */
  *#closedAnswers(request: Type): Generator<Entry> {
    yield* this.#closed.get(request) ?? [];
    if (request.kind === 'union') {
      for (const member of request.members) {
        yield* this.#closed.get(member) ?? [];
      }
    }
  }

  /**
   * The registration is the PATTERN side and must extend the request — its value has to be usable
   * AS the requested type — with its holes capturing the request's fragments, so `Box<%T>` serves
   * `Box<Foo>` closed over `T := Foo`.
   */
  *#openAnswers(request: Type): Generator<Entry> {
    for (const entry of this.#open) {
      const [matched, generics] = Type.match(entry.descriptor.serviceType, request);
      if (matched) {
        yield { descriptor: ServiceDescriptor.substitute(entry.descriptor, generics), rank: entry.rank };
      }
    }
  }
}
