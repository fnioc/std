import type { NamedType } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

/** True for a union, false for anything else — including `never`, which distributes to nothing. */
type IsUnion<T, Members = T> = T extends unknown ? ([Members] extends [T] ? false : true) : never;

/**
 * Marks a constructor parameter that receives the {@link NamedType} of a type argument instead of a
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
 * @example
 * ```ts
 * class Logger<T> {
 *   public constructor(factory: ILoggerFactory, category: Typeof<T>) {
 *     this.#logger = factory.createLogger(category.name);
 *   }
 * }
 * ```
 */
export type Typeof<T> = IsUnion<T> extends true ? never
  : [T] extends [Func<never[], unknown>] ? never
  : NamedType;
