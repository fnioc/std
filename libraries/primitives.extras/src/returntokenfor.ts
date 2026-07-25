/**
 * Compile-time token of a factory type's return type — the product a
 * `resolveFactory(returnToken, paramTokens)` call builds. Resolved to a string
 * literal at compile time; the body only runs — and throws — if that
 * resolution didn't happen.
 *
 * @remarks
 * `returntokenfor<() => IThing>()` resolves to `"pkg:IThing"`. An async
 * factory's `Promise<X>` return type is NOT unwrapped — its token is derived
 * from the closed `Promise<X>` type itself, not from `X`.
 *
 * @example
 * ```ts
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

export const RETURN_TOKENFOR_NAME = 'returntokenfor';
