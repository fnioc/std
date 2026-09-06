import { Type } from '@rhombus-std/primitives';

/**
 * The root every error the engine raises extends.
 *
 * @remarks
 * A library holding only the abstractions can tell an engine failure from anything else with
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
 * Nothing in the manifest can produce a value for {@link address}.
 *
 * @remarks
 * Catch this to fall back to another candidate — a union member, a later signature.
 * Anything else escaping a resolution is a fault rather than an unsatisfiable
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
  readonly address: Type;

  constructor(
    address: Type,
    reason: string,
    cause?: UnsatisfiableError,
  ) {
    super(`cannot satisfy ${address} — ${reason}`, { cause });
    this.name = 'UnsatisfiableError';
    this.address = address;
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
    super(`circular dependency: ${chain.join(' -> ')}`);
    this.name = 'CycleError';
    this.chain = chain;
  }
}

/**
 * The installed lifetime model threw while realizing {@link address} — the model's own code,
 * not the construction it was asked to perform. The model's error is the `cause`.
 *
 * @remarks
 * Deliberately not an {@link UnsatisfiableError}: a throwing model is a fault in the installed
 * engine rather than a candidate to fall back from.
 */
export class LifetimeModelError extends DiError {
  /** The service type whose realization the model failed. */
  readonly address: Type;

  constructor(address: Type, cause: unknown) {
    super(`the lifetime model failed realizing ${address}`, { cause });
    this.name = 'LifetimeModelError';
    this.address = address;
  }
}

/** A registration produced a thenable that is not a `Promise`, met where the engine would have to await it. */
export class NonPromiseThenableError extends DiError {
  /** The service type whose registration produced the thenable. */
  readonly address: Type;

  constructor(address: Type) {
    super(
      `${Type.stringify(address)} produced a thenable that is not a Promise; `
        + `a then member would lead to unpredictable results when the value is awaited`,
    );
    this.name = 'NonPromiseThenableError';
    this.address = address;
  }
}

/**
 * A registration is addressed by a bare type parameter, which unifies with every request — so it
 * answers every address no newer registration already answers.
 */
export class UniversalAddressError extends DiError {
  /** The address that is nothing but a hole. */
  readonly address: Type;

  constructor(address: Type) {
    super(
      `${address} is nothing but a type parameter, so this registration answers every request no newer one does; `
        + `give it the service type it provides and leave the hole inside — ILogger<%T> rather than %T`,
    );
    this.name = 'UniversalAddressError';
    this.address = address;
  }
}

/**
 * A resolution or scope opening reached a disposed provider — the one `build()` returns, or an
 * opened scope — the standard lifetime model's refusal, a clone of the one
 * Microsoft.Extensions.DependencyInjection raises.
 *
 * @remarks
 * Disposing a scope's provider refuses every later ask through it; disposing the provider
 * `build()` returns refuses every later ask through every provider, and refuses opening a scope.
 */
export class ObjectDisposedError extends DiError {
  constructor() {
    super('the provider is disposed — it or its scope has ended, so it can no longer resolve or open a scope');
    this.name = 'ObjectDisposedError';
  }
}

/** One registration that could not be lowered. */
export interface ValidationFailure {
  /** The service type of the registration that failed. */
  readonly address: Type;
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
        + failures.map(failure => `  ${failure.address} — ${failure.error.message}`).join('\n'),
    );
    this.name = 'ManifestValidationError';
    this.failures = failures;
    this.errors = failures.map(failure => failure.error);
  }
}
