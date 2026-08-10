import { Func } from '@rhombus-toolkit/func';

/**
 * Restates `T`'s members as a type literal, which carries the implicit index
 * signature an `interface` lacks. An augmentation member map declared as an
 * `interface` (the shape `this`-polymorphic returns require) needs this wrapper
 * to satisfy `AugmentationSet2`'s `Record<PropertyKey, Func>` constraint.
 */
export type Flatten<T> = {
  [K in keyof T]: T[K];
};

const _cache = new WeakMap<Func, WeakMap<object, Map<unknown, unknown>>>();
export function memo<T extends Func>(fn: T, getId?: Func<Parameters<T>, any>) {
  getId ??= ((p: any) => p) as any;
  let byReceiver = _cache.get(fn);
  if (byReceiver === undefined) {
    byReceiver = new WeakMap();
    _cache.set(fn, byReceiver);
  }
  const caches = byReceiver as WeakMap<object, Map<any, ReturnType<T>>>;
  const result = function(this: ThisParameterType<T>, ...args: Parameters<T>): ReturnType<T> {
    const receiver = (this ?? fn) as object;
    let cache = caches.get(receiver);
    if (cache === undefined) {
      cache = new Map();
      caches.set(receiver, cache);
    }
    const id = getId!(...args);
    if (!cache.has(id)) {
      cache.set(id, fn.apply(this, args));
    }
    return cache.get(id)!;
  };
  Object.defineProperty(result, 'name', { value: `${fn.name ?? 'unnamed'}_MEMO`, configurable: true });
  return result;
}

type Contravariant<T> = Func<[T]>;
type ForceCV<T> = T extends unknown ? Contravariant<T> : never;
type ExtractCV<T> = T extends Contravariant<infer I> ? I : never;

type UnionToIntersection<T> = ForceCV<T> extends Contravariant<infer I> ? I : never;
type LastInUnion<T> = ExtractCV<UnionToIntersection<ForceCV<T>>>;

export type UnionToTuple<T> = _UnionToTuple<T, []>;
type _UnionToTuple<T, Result extends readonly unknown[], Last = LastInUnion<T>> = [T] extends [never] ? Result
  : _UnionToTuple<Exclude<T, Last>, readonly [Last, ...Result]>;
