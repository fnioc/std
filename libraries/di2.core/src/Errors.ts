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
    super(`cannot satisfy ${Type.stringify(type)} — ${reason}`, { cause });
    this.name = 'UnsatisfiableError';
    this.type = type;
  }
}

/**
 * A type was requested again while it was still being lowered — the graph loops, so no order
 * of constructions satisfies it.
 *
 * @remarks
 * Deliberately not an {@link UnsatisfiableError}: a loop is a fault in the registrations rather
 * than a candidate to fall back from, so a handler swallowing unsatisfiable requests lets this
 * through.
 */
export class CycleError extends Error {
  /** The path that closed the loop, outermost first, ending in the repeat. */
  readonly chain: readonly Type[];

  constructor(chain: readonly Type[]) {
    super(`circular dependency: ${chain.map(type => Type.stringify(type)).join(' -> ')}`);
    this.name = 'CycleError';
    this.chain = chain;
  }
}

/** One registration that could not be lowered. */
export interface ValidationFailure {
  /** The service type of the registration that failed. */
  readonly type: Type;
  /** What lowering it produced — an {@link UnsatisfiableError}, a {@link CycleError}, or a fault. */
  readonly error: Error;
}

/**
 * Every registration an up-front validation pass could not lower, raised together so one attempt
 * surfaces the whole broken graph instead of its first fault. {@link errors} carries the failures
 * themselves, positionally matching {@link failures}.
 */
export class ManifestValidationError extends AggregateError {
  /** Each failure paired with the registration it came from. */
  readonly failures: readonly ValidationFailure[];

  constructor(failures: readonly ValidationFailure[]) {
    super(
      failures.map(failure => failure.error),
      `cannot satisfy every registration:\n`
        + failures.map(failure => `  ${Type.stringify(failure.type)} — ${failure.error.message}`).join('\n'),
    );
    this.name = 'ManifestValidationError';
    this.failures = failures;
  }
}
