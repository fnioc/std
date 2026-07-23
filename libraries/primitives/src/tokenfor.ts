// `tokenfor<T>()` — the compile-time token mechanism (PRD §8 "Token generation").
//
// At the authoring level `tokenfor<IFoo>()` is a generic function whose return
// type is a plain `string`. The transformer rewrites each `tokenfor<IFoo>()` CALL
// in source to the derived string token at compile time, so callers never ship
// the generation logic to runtime.
//
// The runtime body exists only so that un-transformed code fails loudly instead
// of silently returning `undefined` — if you call `tokenfor` without the
// transformer wired up, you get a clear error pointing at the missing plugin.
//
// It lives in `@rhombus-std/primitives` (the zero-dep leaf) rather than in the
// transformer package so every library imports the single `tokenfor` symbol from
// one home; `@rhombus-std/primitives.transformer` is the base plugin that lowers
// the calls.

/**
 * Compile-time token for a TYPE — `tokenfor<IUserRepo>()`. Rewritten by the
 * @rhombus-std/primitives.transformer build-time transformer to a string
 * literal; the runtime body only runs when the transformer is absent.
 *
 * @example
 * ```ts
 * const key = tokenfor<IUserRepo>(); // → "pkg/contracts:IUserRepo" at compile time
 * ```
 */
export function tokenfor<T>(): string;
/**
 * Compile-time token for the type a VALUE produces — `tokenfor(SqlUserRepo)`.
 * The transformer derives the token from the argument's PRODUCED type: a
 * constructable value (a class) yields the instance it builds, a callable value
 * (a factory) yields what it returns, any other value yields its own type. It is
 * the derivation the no-type-arg self-registration forms (`addClass(C)`,
 * `addFactory(fn)`, `addValue(v)`) lower to. Rewritten at compile time to a string
 * literal; the runtime body only runs when the transformer is absent.
 *
 * @example
 * ```ts
 * const key = tokenfor(SqlUserRepo); // → "pkg:SqlUserRepo" (the instance type) at compile time
 * ```
 */
export function tokenfor(value: unknown): string;
export function tokenfor(_value?: unknown): string {
  throw new Error(
    'tokenfor() requires the @rhombus-std/primitives.transformer build-time transformer, '
      + 'or pass an explicit token string.',
  );
}

/** The exported identifier name the transformer recognizes as `tokenfor`. */
export const TOKENFOR_NAME = 'tokenfor';
