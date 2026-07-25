/**
 * Compile-time array of a factory type's parameter tokens, one per declared
 * parameter, in order. An `Inject<P, "tok">`-branded parameter resolves to its
 * branded token; every other parameter resolves to its own derived token.
 * `paramtokensfor<(a: IA, b: IB) => T>()` resolves to `["pkg:IA", "pkg:IB"]`.
 *
 * @remarks
 * As the trailing argument of a `resolveFactory(...)` call, this is omitted
 * entirely when the factory takes no parameters. The body only runs — and
 * throws — if this call's compile-time resolution didn't happen.
 *
 * @example
 * ```ts
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

export const PARAM_TOKENSFOR_NAME = 'paramtokensfor';
