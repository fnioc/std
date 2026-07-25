// `keyof<T>()` binds a type argument and, at build time, becomes that keyed
// service's registration key as a string literal — `"audit"` for
// `keyof<Keyed<IFoo, "audit">>()` — or `undefined` when the type carries no
// `Keyed<T, K>` brand. Paired with `tokenfor<T>()` (the base token) in a keyed
// registration: `this.addClass(tokenfor<T>(), ctor, signatureof(ctor), void 0, keyof<T>())`.
//
// Named in lowercase for consistency with `tokenfor`/`signatureof`; `keyof` is a
// reserved word only in TYPE positions, so this value-position declaration and
// its calls still compile under strict tsc.

/**
 * Registration key for a `Keyed<T, K>` type, or `undefined` for a plain type.
 *
 * @example
 * ```ts
 * this.addClass(tokenfor<IFoo>(), Foo, signatureof(Foo), void 0, keyof<IFoo>()); // unkeyed → elided
 * this.addClass(tokenfor<T>(), C, signatureof(C), void 0, keyof<Keyed<IFoo, "audit">>()); // → …, "audit"
 * ```
 */
export function keyof<T>(): string | undefined {
  void (0 as unknown as T);
  throw new Error(
    'keyof<T>() requires the @rhombus-std/di.extras authoring transform. '
      + 'Depend on @rhombus-std/di.extras so ttsc spawns the @rhombus-std transform '
      + 'host (which lowers keyof), or pass the registration key explicitly as the trailing '
      + 'argument to addClass(token, ctor, signatures, scope, key).',
  );
}

export const KEYOF_NAME = 'keyof';
