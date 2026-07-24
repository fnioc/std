// `returntokenfor<T>()` — the compile-time FACTORY RETURN-TYPE token (§94, factory
// form). Where `tokenfor<T>()` derives the service token of `T` itself,
// `returntokenfor<F>()` (with `F` a function type) derives the token of what `F`
// RETURNS — the product a `resolveFactory(returnToken, [paramTokens])` builds.
// `returntokenfor<() => IThing>()` → `"pkg:IThing"`; an async factory's
// `Promise<X>` derives the honest closed-generic token (`TokenForReturnType`).
//
// It is the return-type half of the factory resolve body's true arm, sibling to
// `paramtokensfor<T>()` (the parameter half). Both are AUTHORING-ONLY constructs
// used only inside the inline-sugar bodies, never in runtime source, so they home
// here in the token-grammar transformer (§92's homing rule). The runtime body
// only runs when the transformer is absent, and throws so un-lowered code fails
// loud.

/**
 * Compile-time token of a factory type's RETURN type. Rewritten by the
 * transformer to the return type's token string literal; the runtime body only
 * runs when the transformer is absent.
 *
 * @example
 * ```ts
 * // authored inside a resolve sugar body:
 * return this.resolveFactory(returntokenfor<T>(), paramtokensfor<T>());
 * ```
 */
export function returntokenfor<T>(): string {
  void (0 as unknown as T);
  throw new Error(
    'returntokenfor<T>() requires the @rhombus-std/primitives.extras returntokenfor plugin. '
      + 'Add the transformer sugar plugin to your tsconfig "plugins".',
  );
}

/** The exported identifier name the transformer recognizes as `returntokenfor`. */
export const RETURN_TOKENFOR_NAME = 'returntokenfor';
