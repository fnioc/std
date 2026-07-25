/**
 * Compile-time value of a singular type `T` — the one value `T` inhabits.
 * `singularValue<"dev">()` resolves to `"dev"`, `singularValue<42>()` to `42`,
 * `singularValue<null>()` to `null`.
 *
 * @remarks
 * `T` must be singular (see {@link isSingular}) — a non-singular `T` is a
 * compile-time error. The body only runs — and throws — if this call's
 * compile-time resolution didn't happen.
 *
 * @example
 * ```ts
 * return isSingular<T>() ? singularValue<T>() : this.resolve(tokenfor<T>());
 * ```
 */
export function singularValue<T>(): T {
  throw new Error(
    'singularValue<T>() requires the @rhombus-std/primitives.extras singularValue plugin. '
      + 'Add the transformer sugar plugin to your tsconfig "plugins".',
  );
}

export const SINGULAR_VALUE_NAME = 'singularValue';
