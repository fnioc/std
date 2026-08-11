import { Func } from '@rhombus-toolkit/func';

export function* replace<T>(source: Iterable<T>, match: T | Func<[T], boolean>, replacement: T): Generator<T> {
  const predicate = isFunc(match) ? match : (item: T) => item === match;
  for (const item of source) {
    yield predicate(item) ? replacement : item;
  }
}
function isFunc(value: any): value is Func {
  return typeof value === 'function';
}

/** The first element `source` yields, or `undefined` when it yields nothing. */
export function first<T>(source: Iterable<T>): T | undefined {
  for (const value of source) {
    return value;
  }
  return undefined;
}

export function isAllThere<T>(items: Array<T | undefined>): items is T[];
// export function isAllThere<T>(items: IteratorObject<T | undefined>): items is IteratorObject<T>;
// export function isAllThere<T>(items: IterableIterator<T | undefined>): items is IterableIterator<T>;
// export function isAllThere<T>(items: Iterable<T | undefined>): items is Iterable<T>;
export function isAllThere<T>(items: Iterable<T | undefined>): items is Iterable<T> {
  return Iterator.from(items).every(Boolean);
}
