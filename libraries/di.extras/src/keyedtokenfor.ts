// `keyedtokenfor<T>()` — the compile-time COMPOSED keyed-lookup token, sibling to
// `tokenfor<T>()` and `keyof<T>()` (§98).
//
// Where `tokenfor<T>()` lowers to the bare BASE token (a `Keyed<T, K>` brand
// stripped) and `keyof<T>()` lowers to the KEY, `keyedtokenfor<T>()` lowers to the
// SINGLE composed `base#key` string a keyed service actually registers under —
// `keyedtokenfor<Keyed<ICache, "redis">>()` → `"caching.core:ICache#redis"`. For a
// non-keyed type it derives identically to `tokenfor<T>()` (the plain base token),
// so unkeyed lowering is byte-identical.
//
// It exists for the query/async resolve verbs that take ONE token argument and no
// tail key parameter — `isService(token)` and `resolveAsync(token)`. Those verbs
// cannot receive a base + key pair the way `resolve(token, key?)` / `tryResolve(token,
// key?)` do (which pass `tokenfor<T>()` + `keyof<T>()` and let di.core compose at
// runtime), so a keyed query/async resolve must arrive already composed. Passing the
// bare base would SILENTLY probe the unkeyed registration of the same interface —
// the exact mismatch §98 fixes — so the composed single token is the correct token.
//
// The runtime body exists only so that un-transformed code fails loudly instead of
// silently returning `undefined` — calling `keyedtokenfor` without the transformer
// wired up throws a clear error pointing at the missing plugin, exactly like
// `tokenfor` and `keyof`. The name is lowercase for family consistency with
// `tokenfor` / `keyof` / `signatureof`.
//
// It lives here in `@rhombus-std/di.extras` (the authoring-time DI package),
// NOT in the `@rhombus-std/primitives` leaf, because it is ONLY ever called inside
// the inline-sugar bodies (`./inline.ts`) — never in runtime source — so it is an
// authoring-time construct that belongs with the domain transformer, mirroring
// `keyof` and `signatureof`.

/**
 * Compile-time composed keyed-lookup token for a service type. Rewritten by the
 * transformer to the single `base#key` string literal for a `Keyed<T, K>` type, or
 * to the plain base token for a non-keyed type; the runtime body only runs when the
 * transformer is absent.
 *
 * @example
 * ```ts
 * // authored inside a sugar body:
 * this.isService(keyedtokenfor<IFoo>());                    // → this.isService("pkg:IFoo")
 * this.isService(keyedtokenfor<Keyed<ICache, "redis">>());  // → this.isService("caching.core:ICache#redis")
 * ```
 */
export function keyedtokenfor<T>(): string {
  void (0 as unknown as T);
  throw new Error(
    'keyedtokenfor<T>() requires the @rhombus-std/di.extras build-time '
      + 'transformer. Without it, resolve with an explicit composed token: '
      + 'isService("pkg:IFoo#key").',
  );
}

/** The exported identifier name the transformer recognizes as `keyedtokenfor`. */
export const KEYEDTOKENFOR_NAME = 'keyedtokenfor';
