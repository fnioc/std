/**
 * Compile-time token for a type — `tokenfor<IUserRepo>()`. Resolved to a
 * string literal at compile time; calling this without that resolution
 * throws.
 *
 * @example
 * ```ts
 * const key = tokenfor<IUserRepo>(); // → "pkg/contracts:IUserRepo" at compile time
 * ```
 */
export function tokenfor<T>(): string;
/**
 * Compile-time token for the type a value produces — `tokenfor(SqlUserRepo)`.
 * The token is derived from what the value produces: a constructable value (a
 * class) tokenizes as the instance it builds, a callable value (a factory) as
 * what it returns, any other value as its own type — the same derivation
 * `addClass(C)`, `addFactory(fn)`, and `addValue(v)` use for their implicit
 * token. Resolved to a string literal at compile time; calling this without
 * that resolution throws.
 *
 * @example
 * ```ts
 * const key = tokenfor(SqlUserRepo); // → "pkg:SqlUserRepo" (the instance type) at compile time
 * ```
 */
export function tokenfor(value: unknown): string;
export function tokenfor(_value?: unknown): string {
  throw new Error(
    "tokenfor() requires @rhombus-std/primitives.extras's authoring transform to run. "
      + 'It has not been applied. Depend on @rhombus-std/primitives.extras so ttsc spawns the '
      + '@rhombus-std transform host, or pass an explicit token string.',
  );
}

export const TOKENFOR_NAME = 'tokenfor';
