import type { Flatten } from '@rhombus-std/primitives';
import { Func } from '@rhombus-toolkit/func';

/********************** Object ***********************/

export type Entry<Key extends PropertyKey = PropertyKey, Value = any> = readonly [Key, Value];

export type keys<T extends {}> = keyof T;

export type values<T extends {}> = T[keyof T];

export type fromEntries<TUnion extends Entry> = {
  [T in TUnion as T[0]]: T[1];
};

/**
 * The result of `Object.assign(target, ...sources)`: each source shallow-merged over the one before
 * it, left to right.
 *
 * @remarks
 * Arrays and objects merge differently, so {@link ShallowMerge} dispatches on the pair. Two arrays
 * merge INDEX-WISE and the result is as long as the longer of them, which is what makes a short
 * overlay leave the tail alone. Anything else merges by key.
 */
export type assign<Sources extends readonly any[]> = _assign<Sources, Sources[0] extends readonly any[] ? [] : {}>;
type _assign<Sources extends readonly any[], Result extends {}> = Sources extends readonly [...infer Rest, infer Last]
  ? _assign<Rest, ShallowMerge<Last, Result>>
  : Result;

declare global {
  interface ObjectConstructor {
    assign<Target extends object, Sources extends any[]>(target: Target,
      ...sources: Sources): assign<[Target, ...Sources]>;
    fromEntries<TEntry extends Entry>(entries: TEntry[]): fromEntries<TEntry>;
    values<T extends {}>(obj: T): Array<values<T>>;
    keys<T extends {}>(obj: T): Array<keys<T>>;
  }
}

/**
 * `B`'s element at this index, falling back to `A`'s where `B` has none.
 *
 * @remarks
 * `undefined` counts as "none". A tuple type cannot tell a hole (`[, 7]`) from an explicit
 * `undefined` — both read as `undefined` — so falling back is the only reading available, and it is
 * the one a sparse overlay wants. It does diverge from the runtime, where an explicit `undefined`
 * overwrites.
 */
type MergeValue<A extends readonly any[], B extends readonly any[], N extends number> = At<B, N> extends undefined
  ? At<A, N>
  : At<B, N>;

/** `T`'s element at `N`, or `undefined` where `T` is too short to have one. */
type At<T extends readonly any[], N extends number> = N extends keyof T ? T[N] : undefined;

/** Whether the walk has reached the end of both `A` and `B`. */
type Spent<A extends readonly any[], B extends readonly any[], I extends readonly any[]> = keyof A extends keyof I
  ? (keyof B extends keyof I ? true : false)
  : false;

/**
 * `B` overlaid on `A` index-wise, walking one position at a time and stopping once both are spent.
 * The result is as long as the longer of the two, which is what leaves a short overlay's tail alone.
 */
type MergeArrays<A extends readonly any[], B extends readonly any[]> = _MergeArrays<A, B, [], []>;
type _MergeArrays<
  A extends readonly any[],
  B extends readonly any[],
  I extends readonly any[],
  Acc extends readonly any[],
> = Spent<A, B, I> extends true ? Acc
  : _MergeArrays<A, B, [...I, any], [...Acc, MergeValue<A, B, I['length']>]>;

type MergeObjects<A, B> = Flatten<Omit<A, keyof B> & B>;

type ShallowMerge<A, B> = A extends readonly any[] ? (B extends readonly any[] ? MergeArrays<A, B> : MergeObjects<A, B>)
  : MergeObjects<A, B>;

/************************************************/

export type TupleToUnion<T extends readonly unknown[]> = T[number];

/****************** Iterable *******************/

export function* replace<T>(source: Iterable<T>, match: T | Func<[T], boolean>, replacement: T): Generator<T> {
  const predicate = isFunc(match) ? match : (item: T) => item === match;
  for (const item of source) {
    yield predicate(item) ? replacement : item;
  }
}

/**************************************************/

function isFunc(value: any): value is Func {
  return typeof value === 'function';
}
