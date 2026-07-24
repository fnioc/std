// `singularValue<T>()` — the compile-time SINGULAR-VALUE mechanism (§94), the
// value twin of `isSingular<T>()`.
//
// Where `isSingular<T>()` lowers to `true` / `false`, `singularValue<T>()` lowers
// to the singular type's VALUE literal — `singularValue<"dev">()` → `"dev"`,
// `singularValue<42>()` → `42`, `singularValue<null>()` → `null`. It is the same
// `SingletonValue` the Rule-2 resolve short-circuit emits, factored into a
// primitive so a resolve sugar body can spell it directly:
// `isSingular<T>() ? singularValue<T>() : this.resolve(tokenfor<T>())`. Resolving a
// singular type IS its value, so the sugar and the hand-written
// `resolve(tokenfor<"dev">())` fold to the identical literal.
//
// It is only ever reached in the `isSingular<T>()`-guarded TRUE arm, which the
// engine keeps only when `T` is singular; a `singularValue<T>()` over a
// non-singular type is pruned with its dead branch, and a surviving unguarded one
// raises a targeted diagnostic. Like `isSingular`, it is AUTHORING-ONLY and homes
// in the token-grammar transformer; the runtime body only runs when the
// transformer is absent, and throws so un-lowered code fails loud.

/**
 * Compile-time value of a SINGULAR type `T` — the one value `T` inhabits.
 * Rewritten by the transformer to that value literal; the runtime body only runs
 * when the transformer is absent (or `T` is not singular, which is a compile-time
 * error).
 *
 * @example
 * ```ts
 * // authored inside a resolve sugar body:
 * return isSingular<T>() ? singularValue<T>() : this.resolve(tokenfor<T>());
 * ```
 */
export function singularValue<T>(): T {
  throw new Error(
    'singularValue<T>() requires the @rhombus-std/primitives.extras singularValue plugin. '
      + 'Add the transformer sugar plugin to your tsconfig "plugins".',
  );
}

/** The exported identifier name the transformer recognizes as `singularValue`. */
export const SINGULAR_VALUE_NAME = 'singularValue';
