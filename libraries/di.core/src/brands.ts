// Compile-time phantom brands the transformer reads off a constructor/factory
// parameter's TYPE to derive its dep signature: a pinned token override
// (`Inject`), an open-generic skolem (`Hole` / `$`), and a type-argument
// witness (`Typeof`). Grouped here as one cohesive "authoring brands" concern
// -- split out of the former bundled `types.ts` (see docs/decisions.md #46);
// port-original (no reference-source file to mirror). Zero runtime footprint.

import type { Token } from './types.js';

// ── Inject brand ──────────────────────────────────────────────────────────────

/**
 * Compile-time phantom brand that pins a specific token for one constructor or
 * factory parameter, overriding the token the transformer would normally derive.
 *
 * The value type stays `T` — a plain `T` is assignable because the brand
 * property is optional. Zero runtime footprint.
 *
 * @example
 * ```ts
 * class Handler {
 *   constructor(
 *     cache: Inject<ICache, "pkg:redis-cache">,  // pinned token
 *     log: ILogger,                              // derived normally
 *   ) {}
 * }
 * ```
 */
declare const TOK: unique symbol;
export type Inject<T, K extends Token> = T & { readonly [TOK]?: K; };

// ── Hole brand (open generics) ────────────────────────────────────────────────

/**
 * Compile-time skolem standing in for the `N`th type argument of an open
 * template (1-based). Writing `addClass<IRepository<$<1>>>(SqlRepository<$<1>>)`
 * binds the hole; the transformer derives `$N` wherever a Hole-branded type
 * appears.
 *
 * `C` is the constraint carrier: `Hole<1, Entity>` IS an `Entity` (the brand
 * property is optional, so the intersection stays assignable to `C`), which
 * lets a constrained implementation `class Repo<T extends Entity>` accept a
 * hole as its type argument. Zero runtime footprint.
 */
declare const HOLE: unique symbol;
export type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N; };

/**
 * Unbounded sugar for the common unconstrained hole: `$<1>`, `$<2>`, … `$<N>`.
 * `$<N>` is exactly `Hole<N>`; reach for `Hole<N, C>` when the impl's type
 * parameter carries a constraint the skolem must satisfy.
 */
export type $<N extends number> = Hole<N>;

/**
 * Pre-instantiated, non-generic aliases for the nine most common holes:
 * `$1` = `Hole<1>`, … `$9` = `Hole<9>`. One fewer pair of angle brackets than
 * `$<1>` … `$<9>` for the overwhelmingly common case — mirrors how
 * shell/regex backreference syntax treats `$1`-`$9` as directly usable bare
 * identifiers while reserving a bracketed/braced form (`${10}`, `$<10>`,
 * etc.) for everything beyond. `$<N>` stays the only spelling for N ≥ 10, and
 * remains usable at any N for anyone who prefers the generic form.
 */
export type $1 = Hole<1>;
export type $2 = Hole<2>;
export type $3 = Hole<3>;
export type $4 = Hole<4>;
export type $5 = Hole<5>;
export type $6 = Hole<6>;
export type $7 = Hole<7>;
export type $8 = Hole<8>;
export type $9 = Hole<9>;

// ── Typeof brand ────────────────────────────────────────────────────────

/**
 * Compile-time phantom brand marking a constructor parameter that receives the
 * TOKEN STRING of type argument `T` — the `typeof(T)` analog (hence the name).
 * The value type stays `Token` (a plain string is assignable; the brand
 * property is optional).
 *
 * `Typeof<T>` is type-driven: the transformer infers the hole from `T`. The
 * manual counterpart `typeArg(n)` is positional — a plugin-less author names
 * the hole by number.
 *
 * When `T` is a Hole, the transformer emits an open `{ typeArg: N }` slot that
 * substitution closes per registration; when `T` is concrete, it emits the
 * derived token directly as a literal value slot. Zero runtime footprint.
 *
 * @example
 * ```ts
 * class SqlRepository<T> {
 *   constructor(readonly entityToken: Typeof<T>) {}
 * }
 * ```
 */
declare const ARG: unique symbol;
export type Typeof<T> = Token & { readonly [ARG]?: T; };

// ── Keyed brand ─────────────────────────────────────────────────────────────

/**
 * Compile-time phantom brand that pins a resolution KEY for one constructor or
 * factory parameter. A key is not a parallel resolution subsystem — it is a
 * `"#<key>"` suffix on the token the transformer would otherwise derive, so a
 * keyed service registers and resolves under the ordinary composed token
 * `caching.core:ICache#redis`, which hits the existing exact lookup (§98).
 *
 * How that composed token is spelled at a call site depends on the verb's shape:
 *   - a DEPENDENCY slot (a keyed ctor / factory parameter) and the key-less query
 *     verbs (`isService`, `resolveAsync`) carry the SINGLE composed token —
 *     `Keyed<ICache, "redis">` derives `"caching.core:ICache#redis"` directly;
 *   - `resolve` / `tryResolve` take a tail key parameter, so a keyed call lowers to
 *     the split pair `resolve("caching.core:ICache", "redis")` and di.core composes
 *     `base#key` for the lookup — the same token identity, reached two ways.
 *
 * The value type stays `T` — a plain `T` is assignable because the brand
 * property is optional. Zero runtime footprint.
 *
 * `K` is always a string LITERAL (the key text). The brand stacks ORTHOGONALLY
 * with `Inject`: both are optional-property intersections on `T`, so
 * `Keyed<Inject<T, "tok">, "k">` is `T & { [TOK]?: "tok" } & { [KEY]?: "k" }`.
 * The transformer reads `[TOK]` (base override) and `[KEY]` (key suffix)
 * independently — `[TOK]` (or `T` itself) fixes the base token, `[KEY]` appends
 * `"#" + K`.
 *
 * @example
 * ```ts
 * class Handler {
 *   constructor(
 *     redis: Keyed<ICache, "redis">,  // dep slot: "caching.core:ICache#redis"
 *   ) {}
 * }
 * ```
 */
declare const KEY: unique symbol;
export type Keyed<T, K extends string> = T & { readonly [KEY]?: K; };
