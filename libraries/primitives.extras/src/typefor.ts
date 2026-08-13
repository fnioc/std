import type { CtorType, FuncType, Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

/**
 * The {@link Type} `typefor` yields for `T`, narrowed to the kind `T` denotes so a constructor's
 * `instanceType` and a function's `returnType` / `args` read without a cast.
 *
 * @remarks
 * Only the two kinds whose accessors carry the derivation are narrowed. A literal branch would be
 * unsound in the case that matters — `[T] extends [string]` holds for the wide `string` as readily
 * as for `"dev"` — so a literal keeps the whole union.
 */
export type TypeFor<T> = [T] extends [abstract new(...args: never[]) => unknown] ? CtorType
  : [T] extends [Func<never[], unknown>] ? FuncType
  : Type;

/**
 * Compile-time {@link Type} for a type — `typefor<IUserRepo>()`.
 *
 * @remarks
 * The type is derived exactly as spelled: no constructor or call unwrap, and a keyed type arrives
 * as its tag. Every derivation the token primitives used to bake in is a field read on the result —
 * `typefor(C).instanceType` for what a class builds, `typefor<F>().returnType` and
 * `typefor<F>().args` for what a factory returns and takes.
 *
 * Resolved at compile time; calling this without that resolution throws.
 *
 * @example
 * ```ts
 * services.addClass(typefor<ICache>(), RedisCache, [[]]);
 * // → services.addClass(Type.named('ICache', '@rhombus-std/caching.core'), RedisCache, [[]])
 * ```
 */
export function typefor<T>(): TypeFor<T>;
/**
 * Compile-time {@link Type} for a value's own type — `typefor(SqlUserRepo)`.
 *
 * @remarks
 * A class arrives as the constructor it is, not as the instance it builds; read `.instanceType` for
 * that. Resolved at compile time; calling this without that resolution throws.
 *
 * @example
 * ```ts
 * const built = typefor(SqlUserRepo).instanceType; // → Type.named('SqlUserRepo', 'pkg')
 * ```
 */
export function typefor<V>(value: V): TypeFor<V>;
export function typefor(_value?: unknown): Type {
  throw new Error(
    'typefor() requires the @rhombus-std/primitives.extras build-time transformer, '
      + 'or pass a type token string to a public API that accepts one.',
  );
}

export const TYPEFOR_NAME = 'typefor';
