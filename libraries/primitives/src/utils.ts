import { Func } from '@rhombus-toolkit/func';

type Contravariant<T> = Func<[T]>;
type ForceCV<T> = T extends unknown ? Contravariant<T> : never;
type ExtractCV<T> = T extends Contravariant<infer I> ? I : never;

type UnionToIntersection<T> = ForceCV<T> extends Contravariant<infer I> ? I : never;
type LastInUnion<T> = ExtractCV<UnionToIntersection<ForceCV<T>>>;

export type UnionToTuple<T> = _UnionToTuple<T, []>;
type _UnionToTuple<T, Result extends readonly unknown[], Last = LastInUnion<T>> = [T] extends [never] ? Result
  : _UnionToTuple<Exclude<T, Last>, readonly [Last, ...Result]>;
