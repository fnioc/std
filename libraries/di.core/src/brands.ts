// Compile-time phantom brands, read off a constructor or factory parameter's TYPE
// to decide what fills its dependency slot: a pinned token (`Inject`), an
// open-generic hole (`Hole` / `$`), a resolution key (`Keyed`), and a
// type-argument witness (`Typeof`). All of them erase — zero runtime footprint.

import type { NominalType } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

/** True for a union, false for anything else — including `never`, which distributes to nothing. */
type IsUnion<T, Members = T> = T extends unknown ? ([Members] extends [T] ? false : true) : never;

// ── Inject ────────────────────────────────────────────────────────────────────

declare const TOKEN: unique symbol;

/**
 * Pins one parameter's service type, overriding the type it would otherwise
 * derive from its own declaration.
 *
 * @remarks
 * The value type stays `T` — a plain `T` remains assignable, because the brand
 * property is optional.
 *
 * @example
 * ```ts
 * class Handler {
 *   public constructor(
 *     cache: Inject<ICache, 'pkg:redis-cache'>, // pinned
 *     log: ILogger, // derived
 *   ) {}
 * }
 * ```
 */
export type Inject<T, K extends string> = T & { readonly [TOKEN]?: K; };

// ── Hole ──────────────────────────────────────────────────────────────────────

declare const HOLE: unique symbol;

/**
 * Stands for a type argument an open registration has not been closed against
 * yet — the parameter's slot is filled by whatever the request closes it to.
 *
 * @remarks
 * `N` numbers the hole so several can be told apart and a repeated one binds
 * consistently. `C` constrains what may close it, and defaults to anything.
 */
export type Hole<N extends number, C = unknown> = C & { readonly [HOLE]?: N; };

/** {@link Hole} without a constraint — the spelling an open template usually wants. */
export type $<N extends number> = Hole<N>;

// ── Keyed ─────────────────────────────────────────────────────────────────────

declare const KEY: unique symbol;

/**
 * Pins a resolution key, distinguishing one registration of a service type from
 * another.
 *
 * @remarks
 * A key is not a parallel lookup: it tags the service type, so the key travels
 * inside the type rather than beside it and a request has to spell the same tag
 * to reach the registration. `Keyed<ICache, 'redis'>` is therefore one type, not
 * a type plus an argument.
 *
 * The value type stays `T` — a plain `T` remains assignable, because the brand
 * property is optional — and `K` is always a string literal. It stacks with
 * {@link Inject}, both being optional-property intersections: `Keyed<Inject<T,
 * 'tok'>, 'k'>` pins the type and tags it.
 *
 * @example
 * ```ts
 * class Handler {
 *   public constructor(redis: Keyed<ICache, 'redis'>) {}
 * }
 * ```
 */
export type Keyed<T, K extends string> = T & { readonly [KEY]?: K; };

// ── Typeof ────────────────────────────────────────────────────────────────────

/**
 * Marks a constructor parameter that receives the {@link NominalType} of a type argument instead of a
 * resolved instance of it — `Logger<T>` naming its category after `T` rather than constructing one.
 *
 * @remarks
 * A bare type argument in a signature already means "resolve the service of the closing type", so
 * the witness has to be spelled differently; this is that spelling.
 *
 * A witness is only useful when the type has a name to read, so anything else resolves to `never`
 * and is refused where it is written rather than arriving as an `undefined` name. The refusal is
 * type-level because it has to hold for a caller who never runs the transformer.
 *
 * Witnesses for different types do not interchange, so a swapped one is refused where it is passed.
 * Two structurally identical types are one type here as everywhere, and share a witness.
 *
 * @example
 * ```ts
 * class Logger<T> {
 *   public constructor(factory: ILoggerFactory, category: Typeof<T>) {
 *     this.#logger = factory.createLogger(category.name);
 *   }
 * }
 * ```
 */
declare const WITNESS: unique symbol;

export type Typeof<T> = IsUnion<T> extends true ? never
  : [T] extends [Func<never[], unknown>] ? never
  : NominalType & { readonly [WITNESS]?: T; };
