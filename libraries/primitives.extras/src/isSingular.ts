// `isSingular<T>()` — the compile-time SINGULAR-TYPE predicate (§94).
//
// "Singular" is the token grammar's term for a type with exactly one value: a
// string / number / bigint / boolean literal, or the whole-type `void` /
// `undefined` / `null` singletons (the same `SingletonValue` the Rule-2 resolve
// short-circuit reads). `isSingular<T>()` lowers to the boolean literal `true`
// when `T` is singular and `false` otherwise, so a resolve-family sugar body can
// branch on it at compile time — `isSingular<T>() ? singularValue<T>() :
// this.resolve(tokenfor<T>())` — and the engine constant-folds the dead branch away.
//
// It is an AUTHORING-ONLY construct: it appears only inside the inline-sugar
// bodies, never in runtime source, so it lives here in the token-grammar
// transformer (`@rhombus-std/primitives.extras`) rather than the runtime
// `@rhombus-std/primitives` leaf — the §92 homing rule, which for a
// runtime-imported primitive like `tokenfor` keeps it in the leaf, but for a
// body-only predicate homes it in the domain transformer. The runtime body only
// runs when the transformer is absent, and throws so un-lowered code fails loud.

/**
 * Compile-time predicate: does `T` have exactly one value (a literal, `null`,
 * `undefined`, or `void`)? Rewritten by the transformer to `true` / `false`; the
 * runtime body only runs when the transformer is absent.
 *
 * @example
 * ```ts
 * // authored inside a resolve sugar body:
 * return isSingular<T>() ? singularValue<T>() : this.resolve(tokenfor<T>());
 * ```
 */
export function isSingular<T>(): boolean {
  void (0 as unknown as T);
  throw new Error(
    'isSingular<T>() requires the @rhombus-std/primitives.extras isSingular plugin. '
      + 'Add the transformer sugar plugin to your tsconfig "plugins".',
  );
}

/** The exported identifier name the transformer recognizes as `isSingular`. */
export const IS_SINGULAR_NAME = 'isSingular';
