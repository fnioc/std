// `keyedtokenfor<T>()` becomes, at build time, the single composed `base#key`
// string a keyed service registers under — `keyedtokenfor<Keyed<ICache,
// "redis">>()` → `"caching.core:ICache#redis"`. For a non-keyed type it's
// identical to `tokenfor<T>()`, the plain base token.
//
// It exists for `isService(token)` and `resolveAsync(token)`, which take a
// single token argument and no separate key parameter — unlike
// `resolve`/`tryResolve`, which take `tokenfor<T>()` and `keyof<T>()` separately
// and let the registry compose them. Passing the bare base token here would
// silently probe the unkeyed registration of the same interface instead of the
// keyed one.

/**
 * Composed `base#key` lookup token for a `Keyed<T, K>` type, or the plain base
 * token for a non-keyed type.
 *
 * @example
 * ```ts
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

export const KEYEDTOKENFOR_NAME = 'keyedtokenfor';
