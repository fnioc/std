import { Type } from '@rhombus-std/primitives';

/**
 * The root every error the container raises extends.
 *
 * @remarks
 * A library holding only the abstractions can tell a container failure from anything else with
 * one check, without naming the engine or knowing which failure it was:
 *
 * ```ts
 * catch (error) {
 *   if (error instanceof DiError) {
 *     return fallback;
 *   }
 *   throw error;
 * }
 * ```
 *
 * Reach for a leaf type when the distinction matters — {@link UnsatisfiableError} is a candidate
 * to fall back from, while {@link CycleError} is a fault in the registrations that a fall-back
 * handler should let through.
 */
export abstract class DiError extends Error {}

/**
 * Nothing in the manifest can produce a value for {@link serviceType}.
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
export class UnsatisfiableError extends DiError {
  /** The service type that could not be resolved. */
  readonly serviceType: Type;

  constructor(serviceType: Type, reason: string, cause?: UnsatisfiableError) {
    super(`cannot satisfy ${Type.stringify(serviceType)} — ${reason}`, { cause });
    this.name = 'UnsatisfiableError';
    this.serviceType = serviceType;
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
export class CycleError extends DiError {
  /** The path that closed the loop, outermost first, ending in the repeat. */
  readonly chain: readonly Type[];

  constructor(chain: readonly Type[]) {
    super(`circular dependency: ${chain.map(type => Type.stringify(type)).join(' -> ')}`);
    this.name = 'CycleError';
    this.chain = chain;
  }
}

/**
 * The installed lifetime model threw while realizing {@link serviceType} — the model's own code,
 * not the construction it was asked to perform. The model's error is the `cause`.
 *
 * @remarks
 * Deliberately not an {@link UnsatisfiableError}: a throwing model is a fault in the installed
 * engine rather than a candidate to fall back from.
 */
export class LifetimeModelError extends DiError {
  /** The service type whose realization the model failed. */
  readonly serviceType: Type;

  constructor(serviceType: Type, cause: unknown) {
    super(`the lifetime model failed realizing ${Type.stringify(serviceType)}`, { cause });
    this.name = 'LifetimeModelError';
    this.serviceType = serviceType;
  }
}

/** One registration that could not be lowered. */
export interface ValidationFailure {
  /** The service type of the registration that failed. */
  readonly serviceType: Type;
  /** What lowering it produced — an {@link UnsatisfiableError}, a {@link CycleError}, or a fault. */
  readonly error: Error;
}

/**
 * Every registration an up-front validation pass could not lower, raised together so one attempt
 * surfaces the whole broken graph instead of its first fault. {@link errors} carries the failures
 * themselves, positionally matching {@link failures}.
 */
export class ManifestValidationError extends DiError {
  /** Each failure paired with the registration it came from. */
  readonly failures: readonly ValidationFailure[];
  /** The failures themselves, positionally matching {@link failures}. */
  readonly errors: readonly Error[];

  constructor(failures: readonly ValidationFailure[]) {
    super(
      `cannot satisfy every registration:\n`
        + failures.map(failure => `  ${Type.stringify(failure.serviceType)} — ${failure.error.message}`).join('\n'),
    );
    this.name = 'ManifestValidationError';
    this.failures = failures;
    this.errors = failures.map(failure => failure.error);
  }
}
