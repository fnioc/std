/**
 * Extending answers a new list sharing everything already there, so whoever holds one reads
 * exactly what it held however much is added or removed afterwards.
 *
 * @remarks
 * Both ends are known. {@link push} adds at the head and shares the whole list after it, which
 * leaves the tail the same link it already was — so a list knows what it ends with without ever
 * walking to find out. {@link tailToHead} is settled once per list and answered from then on, which
 * is what lets a list be read from its tail as often as wanted without paying to reverse it.
 */
export class ImmutableLinkedList<T> implements Iterable<T> {
  /** The one list holding nothing, however it is asked for. */
  static readonly #nothing = new ImmutableLinkedList<never>(undefined, undefined, 0);

  readonly #head: Link<T> | undefined;
  readonly #tail: Link<T> | undefined;
  /** Settled the first time the list is read from its tail, and answered from then on. */
  #reversed: readonly T[] | undefined;

  /** How many values the list holds. */
  readonly size: number;

  private constructor(head: Link<T> | undefined, tail: Link<T> | undefined, size: number) {
    this.#head = head;
    this.#tail = tail;
    this.size = size;
  }

  /** A list of `T` with nothing in it. */
  static empty<T>(): ImmutableLinkedList<T> {
    return ImmutableLinkedList.#nothing;
  }

  /** The value at the head, absent where the list holds nothing. */
  get head(): T | undefined {
    return this.#head?.value;
  }

  /** The value at the tail, absent where the list holds nothing. */
  get tail(): T | undefined {
    return this.#tail?.value;
  }

  /** This list with `value` at the head, everything already here shared. */
  push(value: T): ImmutableLinkedList<T> {
    const head: Link<T> = { value, next: this.#head };
    return new ImmutableLinkedList(head, this.#tail ?? head, this.size + 1);
  }

  /**
   * This list without the first value `matches` answers for, everything after it shared; the list
   * itself where nothing matches.
   */
  remove(matches: (value: T) => boolean): ImmutableLinkedList<T> {
    const head = removed(this.#head, matches);
    if (head === this.#head) {
      return this;
    }
    return new ImmutableLinkedList(head, tailOf(head), this.size - 1);
  }

  /** The values from the head to the tail. */
  *[Symbol.iterator](): Iterator<T> {
    for (let link = this.#head; link !== undefined; link = link.next) {
      yield link.value;
    }
  }

  /** The values from the tail to the head. */
  tailToHead(): readonly T[] {
    this.#reversed ??= [...this].reverse();
    return this.#reversed;
  }
}

/** One value and the link after it, closer to the tail. */
interface Link<T> {
  readonly value: T;
  readonly next: Link<T> | undefined;
}

/** `link` without the first value `matches` answers for, or `link` itself where nothing matches. */
function removed<T>(link: Link<T> | undefined, matches: (value: T) => boolean): Link<T> | undefined {
  if (link === undefined) {
    return undefined;
  }
  if (matches(link.value)) {
    return link.next;
  }
  const next = removed(link.next, matches);
  return next === link.next ? link : { value: link.value, next };
}

/** The last link `link` reaches, absent where there is none. */
function tailOf<T>(link: Link<T> | undefined): Link<T> | undefined {
  let tail = link;
  while (tail?.next !== undefined) {
    tail = tail.next;
  }
  return tail;
}
