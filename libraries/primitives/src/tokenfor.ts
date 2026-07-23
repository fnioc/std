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
 * Compile-time token for a type. Rewritten by the
 * @rhombus-std/primitives.transformer build-time transformer to a string
 * literal; the runtime body only runs when the transformer is absent.
 *
 * @example
 * ```ts
 * const key = tokenfor<IUserRepo>(); // → "pkg/contracts:IUserRepo" at compile time
 * ```
 */
export function tokenfor<T>(): string {
  void (0 as unknown as T);
  throw new Error(
    'tokenfor<T>() requires the @rhombus-std/primitives.transformer build-time transformer, '
      + 'or pass an explicit token string.',
  );
}

/** The exported identifier name the transformer recognizes as `tokenfor`. */
export const TOKENFOR_NAME = 'tokenfor';
