/**
 * Compile-time token for a type, derived raw — `tokenof<IOptions<T>>()`. The
 * token is derived from the type exactly as spelled, alias-preserving and with
 * no brand handling: a `Keyed<T, K>` argument tokenizes as the aliased
 * `Keyed<...>` reference, not the brand-stripped base that `tokenfor<T>()`
 * yields for a keyed service registration. It is the derivation the tokenless
 * `addOptions<T>()` form uses for its element token, so the registered
 * `IOptions<T>` wrapper and the `T` it wraps stay relationally locked.
 * Resolved to a string literal at compile time; calling this without that
 * resolution throws.
 *
 * @example
 * ```ts
 * const key = tokenof<UserOptions>(); // → "pkg:UserOptions" at compile time
 * ```
 */
export function tokenof<T>(): string;
/**
 * Compile-time token for a value's own type — `tokenof(makeThing)`. The token
 * is derived from the argument's type exactly as reported, with no
 * construct/call unwrap: a factory tokenizes as the function itself, a class
 * reference as its constructor type, any other value as its own type. It is
 * the derivation the no-type-arg `addValue(v)` self-registration form uses.
 * Resolved to a string literal at compile time; calling this without that
 * resolution throws.
 *
 * @example
 * ```ts
 * const key = tokenof(makeThing); // → "pkg:makeThing" (the function's own type) at compile time
 * ```
 */
export function tokenof(value: unknown): string;
export function tokenof(_value?: unknown): string {
  throw new Error(
    'tokenof() requires the @rhombus-std/primitives.extras build-time transformer, '
      + 'or pass an explicit token string.',
  );
}

export const TOKENOF_NAME = 'tokenof';
