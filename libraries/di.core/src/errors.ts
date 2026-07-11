// The DI error taxonomy's base + the registration-time errors raised by the
// registration builder. The base `DiError` lives here so both the builder
// (di.core) and the engine (`@rhombus-std/di`, whose resolution errors extend it)
// share one root — a consumer can `catch (e) { if (e instanceof DiError) … }`
// across the whole surface. Resolution-time errors live with the engine.

import type { Token } from './types.js';

/** Base class for every error the container raises. */
export class DiError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Activation failed in `ActivatorUtilities` — a constructor slot could neither be
 * resolved from the provider nor filled by a supplied argument. The reference DI
 * throws `InvalidOperationException` ("Unable to resolve service …") from the same
 * spot; a `Token` names the unsatisfiable slot. Registration-time (di.core), not
 * resolution-time, because activation runs its OWN construction against the public
 * provider surface — it never enters the `@rhombus-std/di` resolution engine.
 */
export class ActivationError extends DiError {
  public constructor(
    public readonly ctorName: string,
    /** The slot token that could not be filled, when the failure names one. */
    public readonly token?: Token,
  ) {
    super(
      token === undefined
        ? `Unable to activate "${ctorName}": a constructor argument is neither `
          + `resolvable from the provider nor supplied directly.`
        : `Unable to activate "${ctorName}": the constructor argument "${token}" `
          + `is neither registered in the provider nor supplied directly.`,
    );
  }
}

/**
 * An open template token was passed to a registration method that cannot
 * accept one: `addValue`/`addFactory` (open registrations are class-only), or
 * `add` with a template whose type arguments are not ALL holes (v1 forbids
 * mixing concrete args and holes in the service token).
 */
export class OpenTokenRegistrationError extends DiError {
  public constructor(
    public readonly token: Token,
    public readonly method: 'add' | 'addFactory' | 'addValue',
  ) {
    super(
      method === 'add'
        ? `Cannot register open template "${token}": every type argument of `
          + `an open service token must be a hole ($N). Make every argument `
          + `a hole, or close the token fully.`
        : `Cannot register open template "${token}" with ${method}(): open `
          + `registrations are class-only. Register a class with `
          + `add("${token}", MyClass), or close the token first.`,
    );
  }
}
