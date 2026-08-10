import { Func } from '@rhombus-toolkit/func';
import { assertNever } from '@rhombus-toolkit/type-guards';

export type Flatten<T> = {
  [K in keyof T]: T[K];
};

/********************** Object ***********************/

export type Entry<Key extends PropertyKey = PropertyKey, Value = any> = readonly [Key, Value];

export type keys<T extends {}> = keyof T;
// export function keys<T extends {}>(obj: T): Array<keys<T>> {
//     return Object.keys(obj) as any;
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
    keys<T extends {}>(obj: T): Array<keys<T>>;
  }
}

// export function assign<Target extends object, Sources extends any[]>(target: Target, ...sources: Sources): assign<[Target, Sources]> {
//     return Object.assign(target, ...sources);
// }

/************************************************/

export type TupleToUnion<T extends readonly unknown[]> = T[number];

/****************** Iterable *******************/

export function* replace<T>(source: Iterable<T>, match: T | Func<[T], boolean>, replacement: T): Generator<T> {
  const predicate = isFunc(match) ? match : (item: T) => item === match;
  for (const item of source) {
    yield predicate(item) ? replacement : item;
  }
}

function isString2d(value: ReadonlyArray<readonly any[]>): value is ReadonlyArray<readonly string[]> {
  return value[0]?.length === 0 || typeof value[0]?.[0] === 'string';
}
/**************************************************/

function isFunc(value: any): value is Func {
  return typeof value === 'function';
}
