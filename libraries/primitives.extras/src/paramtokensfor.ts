// `paramtokensfor<T>()` — the compile-time FACTORY PARAMETER-TOKEN array (§94,
// factory form). With `T` a function type, it derives the flat array of tokens
// one per declared parameter — `Inject<P, "tok">`-branded params take the branded
// token, every other param its own derived token — exactly the second argument
// `resolveFactory(returnToken, [paramTokens])` carries.
// `paramtokensfor<(a: IA, b: IB) => T>()` → `["pkg:IA", "pkg:IB"]`.
//
// A ZERO-parameter factory needs no parameter array, so as the TRAILING argument
// of a `resolveFactory(...)` call it is ELIDED entirely when the param list is
// empty — matching di.core's own factory lowering, which emits
// `resolveFactory(returnToken)` (no array) for a no-arg factory.
//
// It is the parameter half of the factory resolve body's true arm, sibling to
// `returntokenfor<T>()`. Both are AUTHORING-ONLY constructs used only inside the
// inline-sugar bodies, never in runtime source, so they home here in the
// token-grammar transformer (§92's homing rule). The runtime body only runs when
// the transformer is absent, and throws so un-lowered code fails loud.

/**
 * Compile-time array of a factory type's PARAMETER tokens. Rewritten by the
 * transformer to the `[token, ...]` array literal (or elided as a trailing
 * `resolveFactory` argument when the factory takes no parameters); the runtime
 * body only runs when the transformer is absent. Each token is a plain string
 * (di.core's `Token` is a branded string, structurally assignable).
 *
 * @example
 * ```ts
 * // authored inside a resolve sugar body:
 * return this.resolveFactory(returntokenfor<T>(), paramtokensfor<T>());
 * ```
 */
export function paramtokensfor<T>(): readonly string[] {
  void (0 as unknown as T);
  throw new Error(
    'paramtokensfor<T>() requires the @rhombus-std/primitives.extras paramtokensfor plugin. '
      + 'Add the transformer sugar plugin to your tsconfig "plugins".',
  );
}

/** The exported identifier name the transformer recognizes as `paramtokensfor`. */
export const PARAM_TOKENSFOR_NAME = 'paramtokensfor';
