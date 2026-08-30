// Compile-time phantom brands, read off a constructor or factory arg's TYPE
// to decide what fills its dependency slot: a pinned token (`Inject`) and a
// type-argument witness (`Typeof`). Both erase — zero runtime footprint.

import type { NamedType } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

/** True for a union, false for anything else — including `never`, which distributes to nothing. */
type IsUnion<T, Members = T> = T extends unknown ? ([Members] extends [T] ? false : true) : never;

// ── Inject ────────────────────────────────────────────────────────────────────

declare const TOKEN: unique symbol;

/**
 * Pins one arg's service type, overriding the type it would otherwise
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

// ── Typeof ────────────────────────────────────────────────────────────────────

/**
 * Marks a constructor arg that receives the {@link NamedType} of a type argument instead of a
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
  : NamedType & { readonly [WITNESS]?: T; };
