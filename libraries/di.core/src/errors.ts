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
 * An open template token was passed to a registration method that cannot
 * accept one: `addValue`/`addFactory` (open registrations are class-only), or
 * `addClass` with a template no closed token could ever match — one the token
 * grammar refuses, or a bare hole (`$1`), which names no base to register under.
 * Concrete args and holes MIX freely (`pkg:IRepo<pkg:IUser,$1>`); the v1
 * all-holes rule that used to be enforced here is retired.
 */
export class OpenTokenRegistrationError extends DiError {
  public constructor(
    public readonly token: Token,
    public readonly method: 'addClass' | 'addFactory' | 'addValue',
  ) {
    super(
      method === 'addClass'
        ? `Cannot register open template "${token}": an open service token must `
          + `be a well-formed generic application carrying at least one hole `
          + `(e.g. "pkg:IRepo<$1>" or "pkg:IRepo<pkg:IUser,$1>"). This one names `
          + `no matchable base, so no closed token could ever resolve against it.`
        : `Cannot register open template "${token}" with ${method}(): open `
          + `registrations are class-only. Register a class with `
          + `addClass("${token}", MyClass), or close the token first.`,
    );
  }
}
