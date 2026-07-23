// `tokenof(value)` — the compile-time token for a value's OWN type (PRD §8
// "Token generation"), the RAW-type twin of `tokenfor`.
//
// `tokenfor(value)` derives the token from the value's PRODUCED type (a
// constructable value tokenizes as the instance it builds, a callable value as
// what it returns); `tokenof(value)` never unwraps — it derives the token from
// the value's own type exactly as the checker reports it. A function value
// tokenizes as the FUNCTION (`…:makeThing`), not its return type; a class
// reference as the constructor type (which carries the class symbol, so it lands
// on the same `…:Foo` token either way).
//
// It exists because the no-type-arg `addValue(v)` self-registration form
// registers an ALREADY-BUILT value under its own type — a factory or a class
// passed to `addValue` is stored as-is, not invoked/constructed — so its token
// must come from the value's own type, matching di.core's documented
// function-valued `addValue` support and the di registration engine's own
// `addValue` derivation (which keeps the raw type). The `addClass(ctor)` /
// `addFactory(fn)` self forms keep `tokenfor`'s produced semantics; only
// `addValue(value)` uses `tokenof`.
//
// The transformer rewrites each `tokenof(v)` CALL in source to the derived
// string token at compile time; the runtime body exists only so un-transformed
// code fails loudly instead of silently returning `undefined`. It lives in
// `@rhombus-std/primitives` (the zero-dep leaf) beside `tokenfor` so every
// library imports it from one home.

/**
 * Compile-time token for the value's OWN type — `tokenof(makeThing)`. The
 * transformer derives the token from the argument's type exactly as reported,
 * with NO construct/call unwrap: a factory tokenizes as the function itself, a
 * class reference as its constructor type, any other value as its type. It is
 * the derivation the no-type-arg `addValue(v)` self-registration form lowers to,
 * matching the di registration engine's raw-type `addValue` derivation. Rewritten
 * at compile time to a string literal; the runtime body only runs when the
 * transformer is absent.
 *
 * @example
 * ```ts
 * const key = tokenof(makeThing); // → "pkg:makeThing" (the function's own type) at compile time
 * ```
 */
export function tokenof(_value: unknown): string {
  throw new Error(
    'tokenof() requires the @rhombus-std/primitives.transformer build-time transformer, '
      + 'or pass an explicit token string.',
  );
}

/** The exported identifier name the transformer recognizes as `tokenof`. */
export const TOKENOF_NAME = 'tokenof';
