// Compile-time phantom brands read off a constructor or factory parameter's TYPE
// to derive its dependency slot: a pinned token (`Inject`), an open-generic
// skolem (`Hole` / `$`), a type-argument witness (`Typeof`), and a resolution key
// (`Keyed`). All of them erase — zero runtime footprint.

import type { Token } from './types.js';

// ── Inject brand ──────────────────────────────────────────────────────────────

/**
 * Pins a specific token for one constructor or factory parameter, overriding the
 * token its type would otherwise derive.
 *
 * The value type stays `T` — a plain `T` is assignable because the brand
 * property is optional.
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
 * Stands in for the `N`th type argument of an open template. Labels are 1-BASED
 * and carry no leading zero — `$0` and `$01` are not holes, in this type grammar
 * or in the token-string grammar (`token/parse.ts`). Writing
 * `addClass<IRepository<$<1>>>(SqlRepository<$<1>>)` binds the hole.
 *
 * `C` is the constraint carrier: `Hole<1, Entity>` IS an `Entity` (the brand
 * property is optional, so the intersection stays assignable to `C`), which
 * lets a constrained implementation `class Repo<T extends Entity>` accept a
 * hole as its type argument.
 */
declare const HOLE: unique symbol;
export type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N; };

/**
 * Shorthand for the common unconstrained hole: `$<1>`, `$<2>`, … `$<N>`.
 * `$<N>` is exactly `Hole<N>`; reach for `Hole<N, C>` when the implementation's
 * type parameter carries a constraint the skolem must satisfy.
 *
 * It is the ONE spelling of a bare hole at every label: `$1` is the wire text of
 * a hole inside a token STRING (`"pkg:IRepo<$1>"`), never a type.
 */
export type $<N extends number> = Hole<N>;

// ── Typeof brand ────────────────────────────────────────────────────────

/**
 * Marks a constructor parameter that receives the TOKEN STRING of type argument
 * `T`. The value type stays `Token` (a plain string is assignable; the brand
 * property is optional).
 *
 * When `T` is a `Hole`, the derived slot is an open `{ typeArg: N }` that
 * substitution closes per registration; when `T` is concrete, the slot is the
 * derived token itself. `typeArg(n)` is the positional counterpart, naming the
 * hole by number rather than by type.
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
 * Pins a resolution KEY for one constructor or factory parameter. A key is not a
 * parallel resolution subsystem — it is a `"#<key>"` suffix on the token the
 * parameter would otherwise derive, so a keyed service registers and resolves
 * under the ordinary composed token `caching.core:ICache#redis`.
 *
 * How that composed token is spelled depends on the verb's shape:
 *   - a DEPENDENCY slot and the key-less query verbs (`isService`,
 *     `resolveAsync`) carry the SINGLE composed token — `Keyed<ICache, "redis">`
 *     derives `"caching.core:ICache#redis"` directly;
 *   - `resolve` / `tryResolve` take a tail key parameter, so
 *     `resolve("caching.core:ICache", "redis")` composes `base#key` for the
 *     lookup — the same token identity, reached two ways.
 *
 * The value type stays `T` — a plain `T` is assignable because the brand
 * property is optional. `K` is always a string LITERAL (the key text).
 *
 * The brand stacks ORTHOGONALLY with `Inject`: both are optional-property
 * intersections on `T`, so `Keyed<Inject<T, "tok">, "k">` fixes the base token
 * AND appends `"#k"` to it.
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
