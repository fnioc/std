import { Func } from '@rhombus-toolkit/func';
type Contravariant<T> = Func<[T]>;
type ForceCV<T> = T extends unknown ? Contravariant<T> : never;
type ExtractCV<T> = T extends Contravariant<infer I> ? I : never;

type UnionToIntersection<T> = ForceCV<T> extends Contravariant<infer I> ? I : never;

/**
 * The member the intersection conversion leaves in last position.
 *
 * @remarks
 * `ExtractCV`'s `infer` position carries no bound, so its result reads as `unknown` wherever `T` is
 * still a type parameter. Rephrasing it as a filter over `T` restates the bound the `infer` dropped,
 * which is what lets a caller index by the tuple's elements.
 */
type LastInUnion<T> = Extract<T, ExtractCV<UnionToIntersection<ForceCV<T>>>>;

/**
 * `T`'s union members as a tuple.
 *
 * @remarks
 * Member order is whatever order the compiler's union-to-intersection conversion produces, not
 * declaration order — treat it as unordered unless `T` has exactly one member.
 */
export type UnionToTuple<T> = _UnionToTuple<T, T, []>;

/**
 * `Members` is the full union, held fixed while `T` is eaten one member at a time, so the growing
 * `Result` keeps a bound the shrinking `T` can no longer state.
 */
type _UnionToTuple<
  Members,
  T extends Members,
  Result extends readonly Members[],
  Last extends Members = LastInUnion<T>,
> = [T] extends [never] ? Result
  : _UnionToTuple<Members, Exclude<T, Last>, readonly [Last, ...Result]>;
