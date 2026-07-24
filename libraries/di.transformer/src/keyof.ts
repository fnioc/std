// `keyof<T>()` — the compile-time keyed-registration KEY mechanism, sibling to
// `tokenfor<T>()` (§98).
//
// Where `tokenfor<IFoo>()` binds a TYPE argument and lowers to a service TOKEN,
// `keyof<Keyed<IFoo, "audit">>()` binds a TYPE argument and lowers to that keyed
// service's registration KEY as a string literal — `"audit"` — or to `undefined`
// when the type carries no `Keyed<T, K>` brand. The two are the halves of a keyed
// inline registration: `addClass<T>(ctor)` lowers to `this.addClass(tokenfor<T>(), ctor,
// signatureof(ctor), void 0, keyof<T>())`, where tokenfor derives the base token,
// the `void 0` fills the scope slot the key sits behind, and keyof derives the
// key — composed at runtime by di.core as `base#key`.
//
// The runtime body exists only so that un-transformed code fails loudly instead
// of silently returning `undefined` — calling `keyof` without the transformer
// wired up throws a clear error pointing at the missing plugin, exactly like
// `tokenfor` and `signatureof`. The name is lowercase for family consistency with
// `tokenfor` / `signatureof`; `keyof` is reserved only in TYPE positions, so a
// value-position declaration and call compile under strict tsc.
//
// It lives here in `@rhombus-std/di.transformer` (the authoring-time DI package),
// NOT in the `@rhombus-std/primitives` leaf, because it is ONLY ever called inside
// the inline-sugar bodies (`./inline.ts`) — never in runtime source — so it is an
// authoring-time construct that belongs with the domain transformer, mirroring
// `signatureof`.

/**
 * Compile-time keyed-registration key for a service type. Rewritten by the
 * transformer to the `Keyed<T, K>` key string literal (or `undefined` when T is
 * unkeyed); the runtime body only runs when the transformer is absent.
 *
 * @example
 * ```ts
 * // authored inside a sugar body:
 * this.addClass(tokenfor<IFoo>(), Foo, signatureof(Foo), void 0, keyof<IFoo>()); // unkeyed → elided
 * this.addClass(tokenfor<T>(), C, signatureof(C), void 0, keyof<Keyed<IFoo, "audit">>()); // → …, "audit"
 * ```
 */
export function keyof<T>(): string | undefined {
  void (0 as unknown as T);
  throw new Error(
    'keyof<T>() requires the @rhombus-std/di.transformer authoring transform. '
      + 'Depend on @rhombus-std/di.transformer so ttsc spawns the @rhombus-std transform '
      + 'host (which lowers keyof), or pass the registration key explicitly as the trailing '
      + 'argument to addClass(token, ctor, signatures, scope, key).',
  );
}

/** The exported identifier name the transformer recognizes as `keyof`. */
export const KEYOF_NAME = 'keyof';
