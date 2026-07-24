// `isFactory<T>()` — the compile-time FUNCTION-TYPE predicate (§94, factory form).
//
// A `resolve<F>()` where `F` is a function type (`(a: A) => T`) lowers to a
// `resolveFactory(returnToken, [paramTokens])` call rather than an ordinary
// token resolve. `isFactory<T>()` lowers to the boolean literal `true` when `T`
// is a function type (it carries a call signature) and `false` otherwise, so a
// resolve-family sugar body can branch on it at compile time —
// `isSingular<T>() ? singularValue<T>() : isFactory<T>() ?
// this.resolveFactory(returntokenfor<T>(), paramtokensfor<T>()) :
// this.resolve(tokenfor<T>(), keyof<T>())` — and the engine constant-folds the
// dead branches away. It is the direct sibling of `isSingular<T>()`.
//
// It is an AUTHORING-ONLY construct: it appears only inside the inline-sugar
// bodies, never in runtime source, so it lives here in the token-grammar
// transformer (§92's homing rule), not the runtime `@rhombus-std/primitives`
// leaf. The runtime body only runs when the transformer is absent, and throws so
// un-lowered code fails loud.

/**
 * Compile-time predicate: is `T` a function type (does it carry a call
 * signature)? Rewritten by the transformer to `true` / `false`; the runtime body
 * only runs when the transformer is absent.
 *
 * @example
 * ```ts
 * // authored inside a resolve sugar body:
 * return isFactory<T>() ? this.resolveFactory(returntokenfor<T>(), paramtokensfor<T>()) : this.resolve(tokenfor<T>());
 * ```
 */
export function isFactory<T>(): boolean {
  void (0 as unknown as T);
  throw new Error(
    'isFactory<T>() requires the @rhombus-std/primitives.extras isFactory plugin. '
      + 'Add the transformer sugar plugin to your tsconfig "plugins".',
  );
}

/** The exported identifier name the transformer recognizes as `isFactory`. */
export const IS_FACTORY_NAME = 'isFactory';
