import { Func } from '@rhombus-toolkit/func';

/**
 * Restates `T`'s members as a type literal, which carries the implicit index
 * signature an `interface` lacks. An augmentation member map declared as an
 * `interface` (the shape `this`-polymorphic returns require) needs this wrapper
 * to satisfy `AugmentationSet2`'s `Record<PropertyKey, Func>` constraint.
 *
 * The trailing `& {}` is for the reader, not the checker: it makes an error or a hover print the
 * members rather than the alias name. Keep it — deleting it changes nothing that type-checks, so
 * nothing will fail to tell you it is gone.
 */
export type Flatten<T> = {
  [K in keyof T]: T[K];
} & {};

type Contravariant<T> = Func<[T]>;
type ForceCV<T> = T extends unknown ? Contravariant<T> : never;
type ExtractCV<T> = T extends Contravariant<infer I> ? I : never;

type UnionToIntersection<T> = ForceCV<T> extends Contravariant<infer I> ? I : never;
type LastInUnion<T> = ExtractCV<UnionToIntersection<ForceCV<T>>>;

export type UnionToTuple<T> = _UnionToTuple<T, []>;
type _UnionToTuple<T, Result extends readonly unknown[], Last = LastInUnion<T>> = [T] extends [never] ? Result
  : _UnionToTuple<Exclude<T, Last>, readonly [Last, ...Result]>;

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

/**
 * Whether `I` has walked past everything `T` can offer.
 *
 * @remarks
 * A length of `number` rather than a literal means an unbounded array, or a type parameter still
 * standing in for one. There is no index to walk to, so such an operand is covered from the start
 * and contributes nothing. Without that, a merge inside a generic function has no base case and
 * the checker gives up with an excessive-stack-depth error.
 */
type Covers<T extends readonly any[], I extends readonly any[]> = number extends T['length'] ? true
  : keyof T extends keyof I ? true
  : false;

/** Whether the walk has reached the end of both `A` and `B`. */
type Spent<A extends readonly any[], B extends readonly any[], I extends readonly any[]> = Covers<A, I> extends true
  ? (Covers<B, I> extends true ? true : false)
  : false;

/** One less, for the step budget. */
type Dec<N extends number> = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15][N];

/**
 * `B` overlaid on `A` index-wise, walking one position at a time and stopping once both are spent.
 * The result is as long as the longer of the two, which is what leaves a short overlay's tail alone.
 */
type MergeArrays<A extends readonly any[], B extends readonly any[]> = _MergeArrays<15, A, B, [], []>;
type _MergeArrays<
  TTL extends number,
  A extends readonly any[],
  B extends readonly any[],
  I extends readonly any[],
  Acc extends readonly any[],
> = TTL extends 0 ? never
  : Spent<A, B, I> extends true ? Acc
  : _MergeArrays<Dec<TTL>, A, B, [...I, any], [...Acc, MergeValue<A, B, I['length']>]>;

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
