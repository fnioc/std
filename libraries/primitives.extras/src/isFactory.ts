/**
 * Compile-time predicate: is `T` a function type (does it carry a call
 * signature)? Resolved to a literal `true` or `false` at compile time; the
 * body only runs — and throws — if that resolution didn't happen.
 *
 * @example
 * ```ts
 * return isFactory<T>() ? this.resolveFactory(returntokenfor<T>(), paramtokensfor<T>()) : this.resolve(typefor<T>());
 * ```
 */
export function isFactory<T>(): boolean {
  void (0 as unknown as T);
  throw new Error(
    'isFactory<T>() requires the @rhombus-std/primitives.extras isFactory plugin. '
      + 'Add the transformer sugar plugin to your tsconfig "plugins".',
  );
}

export const IS_FACTORY_NAME = 'isFactory';
