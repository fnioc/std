import { Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';

const _cache = new WeakMap<Func, WeakMap<object, Map<unknown, unknown>>>();
export function memo<T extends Func, Id>(fn: T, getId: Func<Parameters<T>, Id>) {
  let byReceiver = _cache.get(fn);
  if (byReceiver === undefined) {
    byReceiver = new WeakMap();
    _cache.set(fn, byReceiver);
  }
  const caches = byReceiver as WeakMap<object, Map<Id, ReturnType<T>>>;
  const result = function(this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> {
    const receiver = (this ?? fn) as object;
    let cache = caches.get(receiver);
    if (cache === undefined) {
      cache = new Map();
      caches.set(receiver, cache);
    }
    const id = getId(...args);
    if (!cache.has(id)) {
      cache.set(id, fn.apply(this, args));
    }
    return cache.get(id)!;
  };
  Object.defineProperty(result, 'name', { value: `${fn.name ?? 'unnamed'}_MEMO`, configurable: true });
  return result;
}

export type Flatten<T> = {
  [K in keyof T]: T[K];
};

/********************** Object ***********************/

export type Entry<Key extends PropertyKey = PropertyKey, Value = any> = readonly [Key, Value];

export type keys<T extends {}> = keyof T;
// export function keys<T extends {}>(obj: T): Array<keys<T>> {
//     return Object.keys(obj) as any;
// }

export type entries<T extends {}> = EntriesFromKeys<T, UnionToTuple<keyof T>>;
type EntriesFromKeys<T, Keys extends readonly unknown[]> = {
  readonly [I in keyof Keys]: Keys[I] extends keyof T ? Entry<Keys[I], T[Keys[I]]> : never;
};
// export function entries<T extends {}>(obj: T): entries<T>{
//     return Object.entries(obj) as any;
// }

export type values<T extends {}> = T[keyof T];
// export function values<T extends {}>(obj: T): Array<values<T>> {
//     return Object.values(obj);
// }

export type fromEntries<TUnion extends Entry> = {
  [T in TUnion as T[0]]: T[1];
};
// export function fromEntries<TEntry extends Entry>(entries: TEntry[]): fromEntries<TEntry> {
//     return Object.fromEntries(entries) as any;
// }

type ShallowMerge<A, B> = Flatten<Omit<A, keyof B> & B>;

export type assign<Sources extends readonly any[]> = _assign<Sources, {}>;
type _assign<Sources extends readonly any[], Result extends {}> = Sources extends
  readonly [...infer Sources, infer LastSource] ? _assign<Sources, ShallowMerge<LastSource, Result>>
  : Result;

declare global {
  interface ObjectConstructor {
    assign<Target extends object, Sources extends any[]>(target: Target,
      ...sources: Sources): assign<[Target, Sources]>;
    fromEntries<TEntry extends Entry>(entries: TEntry[]): fromEntries<TEntry>;
    values<T extends {}>(obj: T): Array<values<T>>;
    entries<T extends {}>(obj: T): entries<T>;
    keys<T extends {}>(obj: T): Array<keys<T>>;
  }
}

// export function assign<Target extends object, Sources extends any[]>(target: Target, ...sources: Sources): assign<[Target, Sources]> {
//     return Object.assign(target, ...sources);
// }

/************************************************/
type Contravariant<T> = Func<[T]>;
type ForceCV<T> = T extends unknown ? Contravariant<T> : never;
type ExtractCV<T> = T extends Contravariant<infer I> ? I : never;

type UnionToIntersection<T> = ForceCV<T> extends Contravariant<infer I> ? I : never;
type LastInUnion<T> = ExtractCV<UnionToIntersection<ForceCV<T>>>; // extends Contravariant<infer R> ? R : never;

export type UnionToTuple<T> = _UnionToTuple<T, []>;
type _UnionToTuple<T, Result extends readonly unknown[], Last = LastInUnion<T>> = [T] extends [never] ? Result
  : _UnionToTuple<Exclude<T, Last>, readonly [Last, ...Result]>;

export type TupleToUnion<T extends readonly unknown[]> = T[number];

/****************** Iterable *******************/

export function* replace<T>(source: Iterable<T>, match: T | Func<[T], boolean>, replacement: T): Generator<T> {
  const predicate = isFunc(match) ? match : (item: T) => item === match;
  for (const item of source) {
    yield predicate(item) ? replacement : item;
  }
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
/**************************************************/

function isFunc(value: any): value is Func {
  return typeof value === 'function';
}
