import { Func } from '@rhombus-toolkit/func';

/** Yields every element of `source`, substituting `replacement` for each one `match` selects — an exact value or a predicate. */
export function replace<T>(source: Iterable<T>, match: T | Func<[T], boolean>, replacement: Func<[T], T>): Generator<T>;
export function replace<T, U>(source: Iterable<T>, match: T | Func<[T], boolean>, replacement: Func<[T], U>): Generator<T | U>;
export function replace<T>(source: Iterable<T>, match: T | Func<[T], boolean>, replacement: T): Generator<T>;
export function replace<T, U>(source: Iterable<T>, match: T | Func<[T], boolean>, replacement: U): Generator<T | U>;
export function* replace<T, U>(source: Iterable<T>, match: T | Func<[T], boolean>, replacement: U | Func<[T], U>): Generator<T | U> {
  const predicate = isFunc(match) ? match : (item: T) => item === match;
  for (const item of source) {
    yield predicate(item) ? (isFunc(replacement) ? replacement(item) : replacement) : item;
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

/** Type guard: true when every element of `items` is present — none are `undefined`. */
export function isAllThere<T>(items: Array<T | undefined>): items is T[];
export function isAllThere<T>(items: Iterable<T | undefined>): items is Iterable<T> {
  return Iterator.from(items).every(Boolean);
}

/**
 * Yields tuples pairing the sources' elements positionally. `inner` ends with the shortest source,
 * every slot present; `outer` runs to the longest, an exhausted source's slot `undefined` — which a
 * source yielding `undefined` is indistinguishable from.
 */
export function zip<T1, T2>(mode: 'inner', source1: Iterable<T1>, source2: Iterable<T2>): Generator<[T1, T2]>;
export function zip<T1, T2, T3>(mode: 'inner', source1: Iterable<T1>, source2: Iterable<T2>, source3: Iterable<T3>): Generator<[T1, T2, T3]>;
export function zip<T1, T2, T3, T4>(mode: 'inner', source1: Iterable<T1>, source2: Iterable<T2>, source3: Iterable<T3>, source4: Iterable<T4>): Generator<[T1, T2, T3, T4]>;
export function zip<T1, T2, T3, T4, T5>(mode: 'inner', source1: Iterable<T1>, source2: Iterable<T2>, source3: Iterable<T3>, source4: Iterable<T4>,
  source5: Iterable<T5>): Generator<[T1, T2, T3, T4, T5]>;
export function zip<T1, T2, T3, T4, T5, T6>(mode: 'inner', source1: Iterable<T1>, source2: Iterable<T2>, source3: Iterable<T3>, source4: Iterable<T4>, source5: Iterable<T5>,
  source6: Iterable<T6>): Generator<[T1, T2, T3, T4, T5, T6]>;
export function zip<T1, T2, T3, T4, T5, T6, T7>(mode: 'inner', source1: Iterable<T1>, source2: Iterable<T2>, source3: Iterable<T3>, source4: Iterable<T4>, source5: Iterable<T5>, source6: Iterable<T6>,
  source7: Iterable<T7>): Generator<[T1, T2, T3, T4, T5, T6, T7]>;
export function zip<T1, T2, T3, T4, T5, T6, T7, T8>(mode: 'inner', source1: Iterable<T1>, source2: Iterable<T2>, source3: Iterable<T3>, source4: Iterable<T4>, source5: Iterable<T5>,
  source6: Iterable<T6>, source7: Iterable<T7>, source8: Iterable<T8>): Generator<[T1, T2, T3, T4, T5, T6, T7, T8]>;
export function zip<T1, T2, T3, T4, T5, T6, T7, T8, T9>(mode: 'inner', source1: Iterable<T1>, source2: Iterable<T2>, source3: Iterable<T3>, source4: Iterable<T4>, source5: Iterable<T5>,
  source6: Iterable<T6>, source7: Iterable<T7>, source8: Iterable<T8>, source9: Iterable<T9>): Generator<[T1, T2, T3, T4, T5, T6, T7, T8, T9]>;
export function zip<T1, T2>(mode: 'outer', source1: Iterable<T1>, source2: Iterable<T2>): Generator<[T1 | undefined, T2 | undefined]>;
export function zip<T1, T2, T3>(mode: 'outer', source1: Iterable<T1>, source2: Iterable<T2>, source3: Iterable<T3>): Generator<[T1 | undefined, T2 | undefined, T3 | undefined]>;
export function zip<T1, T2, T3, T4>(mode: 'outer', source1: Iterable<T1>, source2: Iterable<T2>, source3: Iterable<T3>,
  source4: Iterable<T4>): Generator<[T1 | undefined, T2 | undefined, T3 | undefined, T4 | undefined]>;
export function zip<T1, T2, T3, T4, T5>(mode: 'outer', source1: Iterable<T1>, source2: Iterable<T2>, source3: Iterable<T3>, source4: Iterable<T4>,
  source5: Iterable<T5>): Generator<[T1 | undefined, T2 | undefined, T3 | undefined, T4 | undefined, T5 | undefined]>;
export function zip<T1, T2, T3, T4, T5, T6>(mode: 'outer', source1: Iterable<T1>, source2: Iterable<T2>, source3: Iterable<T3>, source4: Iterable<T4>, source5: Iterable<T5>,
  source6: Iterable<T6>): Generator<[T1 | undefined, T2 | undefined, T3 | undefined, T4 | undefined, T5 | undefined, T6 | undefined]>;
export function zip<T1, T2, T3, T4, T5, T6, T7>(mode: 'outer', source1: Iterable<T1>, source2: Iterable<T2>, source3: Iterable<T3>, source4: Iterable<T4>, source5: Iterable<T5>, source6: Iterable<T6>,
  source7: Iterable<T7>): Generator<[T1 | undefined, T2 | undefined, T3 | undefined, T4 | undefined, T5 | undefined, T6 | undefined, T7 | undefined]>;
export function zip<T1, T2, T3, T4, T5, T6, T7, T8>(mode: 'outer', source1: Iterable<T1>, source2: Iterable<T2>, source3: Iterable<T3>, source4: Iterable<T4>, source5: Iterable<T5>,
  source6: Iterable<T6>, source7: Iterable<T7>,
  source8: Iterable<T8>): Generator<[T1 | undefined, T2 | undefined, T3 | undefined, T4 | undefined, T5 | undefined, T6 | undefined, T7 | undefined, T8 | undefined]>;
export function zip<T1, T2, T3, T4, T5, T6, T7, T8, T9>(mode: 'outer', source1: Iterable<T1>, source2: Iterable<T2>, source3: Iterable<T3>, source4: Iterable<T4>, source5: Iterable<T5>,
  source6: Iterable<T6>, source7: Iterable<T7>, source8: Iterable<T8>,
  source9: Iterable<T9>): Generator<[T1 | undefined, T2 | undefined, T3 | undefined, T4 | undefined, T5 | undefined, T6 | undefined, T7 | undefined, T8 | undefined, T9 | undefined]>;
export function* zip(mode: 'inner' | 'outer', ...sources: ReadonlyArray<Iterable<unknown>>): Generator<unknown[]> {
  const iterators = sources.map(source => Iterator.from(source));
  while (true) {
    const results = iterators.map(iterator => iterator.next());
    const ended = mode === 'inner' ? results.some(result => result.done) : results.every(result => result.done);
    if (ended) {
      return;
    }
    yield results.map(result => result.value);
  }
}

/** Whether the sources yield pairwise-equal elements and end together. */
export function sequenceEquals<T>(source1: Iterable<T>, source2: Iterable<T>, equals: Func<[left: T, right: T], boolean>): boolean {
  const left = Iterator.from(source1);
  const right = Iterator.from(source2);
  while (true) {
    const first = left.next();
    const second = right.next();
    if (first.done || second.done) {
      return (first.done ?? false) === (second.done ?? false);
    }
    if (!equals(first.value, second.value)) {
      return false;
    }
  }
}
