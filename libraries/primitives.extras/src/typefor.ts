import type { AbstractConstructorType, ArrayType, ConstructorType, FunctionType, IterableType, NamedType, TupleType, Type, TypeLiteralType, UnionType } from '@rhombus-std/primitives';
import type { Ctor, Func } from '@rhombus-toolkit/func';

/** Does `T` inhabit `Shape` in both directions — the shape itself, not a subtype of it? */
type Exactly<T, Shape> = [T] extends [Shape] ? [Shape] extends [T] ? true : false : false;

/** Distributes `T` and asks whether any member fails to cover the whole — true only for a union. */
type IsUnion<T, Each = T> = T extends unknown ? [Each] extends [T] ? false : true : never;

/**
 * The {@link Type} `typefor` yields for `T`, narrowed as far as the spelling can be read back
 * from the structure: callables to their kind (a concrete class before the abstract test, since
 * every concrete constructor also answers the abstract shape), tuples apart from arrays by their
 * literal length, an exact `Iterable<E>`, unions, and scalars — a wide scalar names a type
 * (`NamedType`, since `string` spells a global and `type S = string` an import), a scalar
 * literal is its own value.
 *
 * @remarks
 * A spelling hidden behind a type alias derives to the ALIAS's name — the address must not shift
 * with the aliased structure — while the checker sees only the structure, so an alias-addressed
 * callable, literal, or union arrives as a nominal node at runtime despite the narrower reading
 * here. Interfaces are why no object branch exists: an interface is structurally identical to an
 * inline object type, and an interface address is the dominant call.
 */
export type TypeFor<T> = [T] extends [never] ? Type
  : [T] extends [Ctor<never[], unknown>] ? ConstructorType
  : [T] extends [abstract new(...args: never[]) => unknown] ? AbstractConstructorType
  : [T] extends [Func<never[], unknown>] ? FunctionType
  : [T] extends [unknown[]] ? number extends T['length'] ? ArrayType : TupleType
  : [T] extends [boolean] ? Exactly<T, boolean> extends true ? NamedType : TypeLiteralType<T & boolean>
  : IsUnion<T> extends true ? UnionType
  : [T] extends [string] ? [string] extends [T] ? NamedType : TypeLiteralType<T & string>
  : [T] extends [number] ? [number] extends [T] ? NamedType : TypeLiteralType<T & number>
  : [T] extends [bigint] ? [bigint] extends [T] ? NamedType : TypeLiteralType<T & bigint>
  : [T] extends [undefined] ? TypeLiteralType<undefined>
  : [T] extends [null] ? TypeLiteralType<null>
  : [T] extends [Iterable<infer E>] ? [Iterable<E>] extends [T] ? IterableType : Type
  : Type;

/**
 * Compile-time {@link Type} for a type — `typefor<IUserRepo>()`.
 *
 * @remarks
 * The type is derived exactly as spelled: no constructor or call unwrap, and a keyed type arrives
 * as its tag. Every derivation the token primitives used to bake in is a field read on the result —
 * `typefor(C).instance` for what a class builds, `typefor<F>().return` and
 * `typefor<F>().signatures` for what a factory returns and takes.
 *
 * Resolved at compile time; calling this without that resolution throws.
 *
 * @example
 * ```ts
 * services.add(typefor<ICache>(), RedisCache, Type.ctor(typefor<ICache>()));
 * // → services.add(Type.imported('ICache', '@rhombus-std/caching.core'), RedisCache,
 * //     Type.ctor(Type.imported('ICache', '@rhombus-std/caching.core')))
 * ```
 */
export function typefor<T>(): TypeFor<T>;
/**
 * Compile-time {@link Type} for a value's own type — `typefor(SqlUserRepo)`.
 *
 * @remarks
 * A class arrives as the constructor it is, not as the instance it builds; read `.instance` for
 * that. Resolved at compile time; calling this without that resolution throws.
 *
 * @example
 * ```ts
 * const built = typefor(SqlUserRepo).instance; // → Type.imported('SqlUserRepo', 'pkg')
 * ```
 */
export function typefor<V>(value: V): TypeFor<V>;
export function typefor(_value?: unknown): Type {
  throw new Error(
    "typefor() requires @rhombus-std/primitives.extras's authoring transform to run. "
      + 'It has not been applied. Depend on @rhombus-std/primitives.extras so ttsc spawns the '
      + '@rhombus-std transform host, or pass a type token string to a public API that accepts one.',
  );
}

export const TYPEFOR_NAME = 'typefor';
