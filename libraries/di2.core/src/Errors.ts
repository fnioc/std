import { Type } from '@rhombus-std/primitives';

/**
 * Nothing in the manifest can produce a value for {@link type}.
 *
 * @remarks
 * Catch this to fall back to another candidate — a union member, a later signature.
 * Anything else escaping a resolution walk is a fault rather than an unsatisfiable
 * request, so a handler that swallows it should rethrow what it does not recognise:
 *
 * ```ts
 * catch (error) {
 *   if (error instanceof UnsatisfiableError) {
 *     return undefined;
 *   }
 *   throw error;
 * }
 * ```
 */
export class UnsatisfiableError extends Error {
  /** The type that could not be resolved. */
  readonly type: Type;

  constructor(type: Type, reason: string, cause?: UnsatisfiableError) {
    super(`cannot satisfy ${Type.op.toString(type)} — ${reason}`, { cause });
    this.name = 'UnsatisfiableError';
    this.type = type;
  }
}
