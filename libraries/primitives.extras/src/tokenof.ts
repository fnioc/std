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
// `@rhombus-std/primitives.extras` beside `tokenfor` (the authoring package whose
// ttsc descriptor lowers both); a consumer deps it build-time only, since every
// call elides after lowering (constraint 11 moved the pair out of the runtime
// `@rhombus-std/primitives` leaf).

/**
 * Compile-time token for a TYPE, derived RAW — `tokenof<IOptions<T>>()`. The
 * transformer derives the token from the type exactly as spelled, alias-preserving
 * and with NO brand handling: a `Keyed<T, K>` argument tokenizes as the aliased
 * `Keyed<...>` reference, NOT the brand-stripped base `tokenfor<T>()` yields for a
 * keyed SERVICE registration. It is the derivation the tokenless `addOptions<T>()`
 * form lowers to for its element token, so the registered `IOptions<T>` wrapper and
 * the `T` it wraps are minted from the one raw derivation and stay relationally
 * locked. Rewritten at compile time to a string literal; the runtime body only runs
 * when the transformer is absent.
 *
 * @example
 * ```ts
 * const key = tokenof<UserOptions>(); // → "pkg:UserOptions" at compile time
 * ```
 */
export function tokenof<T>(): string;
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
export function tokenof(value: unknown): string;
export function tokenof(_value?: unknown): string {
  throw new Error(
    'tokenof() requires the @rhombus-std/primitives.extras build-time transformer, '
      + 'or pass an explicit token string.',
  );
}

/** The exported identifier name the transformer recognizes as `tokenof`. */
export const TOKENOF_NAME = 'tokenof';
