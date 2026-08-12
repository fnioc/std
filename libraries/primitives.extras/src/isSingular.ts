/**
 * Compile-time predicate: does `T` have exactly one possible value — a
 * string / number / bigint / boolean literal, or `null` / `undefined` /
 * `void`? Resolved to a literal `true` or `false` at compile time; the body
 * only runs — and throws — if that resolution didn't happen.
 *
 * @example
 * ```ts
 * return isSingular<T>() ? singularValue<T>() : this.resolve(typefor<T>());
 * ```
 */
export function isSingular<T>(): boolean {
  void (0 as unknown as T);
  throw new Error(
    'isSingular<T>() requires the @rhombus-std/primitives.extras isSingular plugin. '
      + 'Add the transformer sugar plugin to your tsconfig "plugins".',
  );
}

export const IS_SINGULAR_NAME = 'isSingular';
