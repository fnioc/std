export interface IterableObject<T, TReturn = void, TNext = unknown> extends Iterable<T, TReturn, TNext> {
  [Symbol.iterator](): IteratorObject<T, TReturn, TNext>;
}
