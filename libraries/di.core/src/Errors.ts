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
 * to fall back from, while {@link CycleError} and {@link AmbiguousUnionError} are faults in the
 * registrations that a fall-back handler should let through.
 */
export abstract class DiError extends Error {}

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
export class UnsatisfiableError extends DiError {
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
 * A union dependency has more than one member the manifest can supply, so nothing about the union
 * says which one is meant.
 *
 * @remarks
 * Deliberately not an {@link UnsatisfiableError}: the request can be met, in more ways than one, so
 * a handler falling back through candidates must not swallow it. Resolve it by narrowing the
 * dependency to the member intended, or by keying a registration so the union no longer names it.
 * A provider built with `unionAmbiguity: 'newest'` takes the most recently registered member
 * instead of raising.
 */
export class AmbiguousUnionError extends DiError {
  /** The union that could not be decided. */
  readonly type: Type;
  /** The members competing to supply it, in the union's own order. */
  readonly members: readonly Type[];

  constructor(type: Type, members: readonly Type[]) {
    super(`cannot choose for ${Type.stringify(type)} — ${members.length} members can be supplied: `
      + members.map(member => Type.stringify(member))
        .toSorted((a, b) => a.localeCompare(b))
        .join(', '));
    this.name = 'AmbiguousUnionError';
    this.type = type;
    this.members = members;
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
export class ManifestValidationError extends DiError {
  /** Each failure paired with the registration it came from. */
  readonly failures: readonly ValidationFailure[];
  /** The failures themselves, positionally matching {@link failures}. */
  readonly errors: readonly Error[];

  constructor(failures: readonly ValidationFailure[]) {
    super(
      `cannot satisfy every registration:\n`
        + failures.map(failure => `  ${Type.stringify(failure.type)} — ${failure.error.message}`).join('\n'),
    );
    this.name = 'ManifestValidationError';
    this.failures = failures;
    this.errors = failures.map(failure => failure.error);
  }
}
