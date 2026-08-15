import { Dec } from './counters';
import type { Flatten } from './Flatten';
import type { UnionToTuple } from './union-vs-tuple';

export type Entry<Key extends string = string, Value = any> = readonly [Key, Value];

/** The keys `Object.keys` lists — string-named, so a symbol-named member never appears. */
type StringKey<T> = Extract<keyof T, string>;

/** A key the runtime hoists ahead of the others and lists in ascending numeric order. */
type IndexKey<T> = Extract<keyof T, number | `${number}`>;

/** A member declared with `?`, which the object at hand may or may not carry. */
type OptionalKey<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never; }[keyof T];

/**
 * Every reason `T`'s keys cannot be spelled as a tuple.
 *
 * @remarks
 * Where this is inhabited, {@link keys} and {@link entries} keep only their array arm. Each member
 * disqualifies for its own reason: an {@link IndexKey} is listed first and numerically rather than
 * in the order the type holds it, and sorting it into place is not something the type system does
 * cheaply; an {@link OptionalKey} may be absent at the call, so neither the length nor any position
 * after it is fixed; and a `string` index signature admits any number of keys, which would otherwise
 * be tupled as the single key `string`.
 *
 * `${number}` also matches spellings that are not array indices — `'1.5'`, `'-3'` — costing an
 * object keyed that way its tuple and nothing else.
 */
type Untuplable<T> =
  | IndexKey<T>
  | OptionalKey<T>
  | (string extends StringKey<T> ? string : never);

type keyTuple<T extends {}> = UnionToTuple<StringKey<T>>;

/**
 * The string keys `Object.keys` yields.
 *
 * @remarks
 * The tuple arm carries the order and is withheld whenever {@link Untuplable} finds a reason to
 * doubt it. The array arm is unconditional, so `map` and the rest stay reachable while `T` is still
 * a type parameter — a position where neither the tuple nor the test in front of it can be
 * evaluated, and an unevaluated conditional carries no members at all.
 */
export type keys<T extends {}> =
  & ([Untuplable<T>] extends [never] ? keyTuple<T> : unknown)
  & readonly StringKey<T>[];

/** The members `Object.values` yields, symbol-named ones excluded as the runtime excludes them. */
export type values<T extends {}> = T[StringKey<T>];

/** Every pair `T` can yield, each key carrying its own member type rather than the union of all. */
export type AnyEntry<T extends {}> = { [K in StringKey<T>]: Entry<K, T[K]>; }[StringKey<T>];

/**
 * The `[key, value]` pairs `Object.entries` yields, in the order {@link keys} lists them.
 *
 * @remarks
 * Withholds its tuple arm on the same condition as {@link keys}, and keeps its array arm for the
 * same reason.
 */
export type entries<T extends {}> =
  & ([Untuplable<T>] extends [never] ? keysToEntries<T, keyTuple<T>> : unknown)
  & readonly AnyEntry<T>[];

/**
 * `Keys` paired with the member each one names on `T`.
 *
 * @remarks
 * The key tuple arrives as a parameter rather than being computed inline so the mapped type reads it
 * as a tuple and hands back a tuple; mapping straight over an unevaluated conditional maps something
 * that contributes `length` and the array methods as members of its own.
 */
export type keysToEntries<T extends {}, Keys extends readonly StringKey<T>[]> = {
  [K in keyof Keys]: Entry<Keys[K], T[Keys[K]]>;
};

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
    values<T extends {}>(obj: T): values<T>[];
    keys<T extends {}>(obj: T): keys<T>;
    entries<T extends {}>(obj: T): entries<T>;
  }
}

type ShallowMerge<A, B> = A extends readonly any[] ? (B extends readonly any[] ? MergeArrays<A, B> : MergeObjects<A, B>)
  : MergeObjects<A, B>;

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

type MergeObjects<A, B> = Flatten<Omit<A, keyof B> & B>;

/** `T`'s element at `N`, or `undefined` where `T` is too short to have one. */
type At<T extends readonly any[], N extends number> = N extends keyof T ? T[N] : undefined;

/** Whether the walk has reached the end of both `A` and `B`. */
type Spent<A extends readonly any[], B extends readonly any[], I extends readonly any[]> = Covers<A, I> extends true
  ? (Covers<B, I> extends true ? true : false)
  : false;

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
