// Typed error classes for the runtime engine.
//
// Each failure mode the resolver can hit gets its own class so consumers can
// branch on `instanceof` rather than string-matching messages. Messages are
// written for a human reading a stack trace at the moment a graph fails to
// resolve.

import { type DepSlot, DiError, type Token } from '@rhombus-std/di.core';

// The error-taxonomy root `DiError` and the registration-time
// `OpenTokenRegistrationError` live in `@rhombus-std/di.core` (raised by the
// registration builder there). di re-exports them so the whole taxonomy stays
// reachable through one `@rhombus-std/di` import; the resolution-time errors
// below extend the shared `DiError` root.
export { ActivationError, DiError, OpenTokenRegistrationError } from '@rhombus-std/di.core';

/**
 * A token was requested but no registration exists for it anywhere in the
 * resolving scope's chain (nor on the builder's base map).
 */
export class UnregisteredTokenError extends DiError {
  public constructor(public readonly token: Token) {
    super(
      `No registration found for token "${token}". Register it with `
        + `services.addClass(...) before resolving.`,
    );
  }
}

/**
 * A constructor with parameters carries no dep signature on its registration —
 * the transformer never saw it and no signature was hand-fed.
 */
export class MissingMetadataError extends DiError {
  public constructor(
    public readonly token: Token,
    public readonly ctorName: string,
  ) {
    super(
      `No dep metadata found for ${ctorName} (resolving "${token}"). The `
        + `constructor has parameters but no dep signature was found on its `
        + `registration. Pass the signature as the third addClass argument `
        + `(addClass(token, ctor, [[...]])), compile with @rhombus-std/di.transformer, or `
        + `register it with a factory.`,
    );
  }
}

/**
 * A constructor has registration-carried signatures, but none of them is
 * directly satisfiable in the owning scope (every signature names at least one token
 * that is not registered, or contains a hole this phase cannot fill).
 */
export class NoSatisfiableSignatureError extends DiError {
  public constructor(
    public readonly token: Token,
    public readonly ctorName: string,
    public readonly unsatisfiable: readonly Token[],
  ) {
    super(
      `No satisfiable constructor signature for ${ctorName} (resolving `
        + `"${token}"). Every candidate signature names a dependency that is `
        + `not registered in the owning scope`
        + (unsatisfiable.length
          ? `; unsatisfiable tokens: ${
            unsatisfiable
              .map((t) => `"${t}"`)
              .join(', ')
          }`
          : '')
        + `. Register the missing dependencies, or provide a useFactory `
        + `override.`,
    );
  }
}

/**
 * A token reappeared on the active resolution stack — the dependency graph has
 * a cycle. The message includes the full path that closed the loop.
 */
export class CircularDependencyError extends DiError {
  public constructor(public readonly path: readonly Token[]) {
    super(`Circular dependency detected:\n  ${path.join(' → ')}`);
  }
}

/**
 * A constructor parameter is typed as a factory of some token (a `FactoryRef`),
 * but that token cannot be turned into a factory: either it is not registered,
 * or it is registered as a `useValue` / `useFactory` override rather than a
 * class. A factory injects a callable that constructs the target class on
 * demand, so the target must be a class registration.
 */
export class FactoryTargetError extends DiError {
  public constructor(
    public readonly factoryToken: Token,
    public readonly reason: 'unregistered' | 'not-a-class',
  ) {
    super(
      reason === 'unregistered'
        ? `Cannot inject a factory for "${factoryToken}": no registration `
          + `found for it. A factory parameter (typed \`() => IFoo\`) needs `
          + `the target registered as a class with `
          + `services.addClass(...) before it can build instances.`
        : `Cannot inject a factory for "${factoryToken}": it is registered `
          + `as a useValue/useFactory override, not a class. A factory builds `
          + `its target with \`new\`, so the target must be a class `
          + `registration. Resolve it directly instead of as a factory, or `
          + `register the class with services.addClass(...).`,
    );
  }
}

/**
 * A `Union` slot was encountered during resolution but none of its member slots
 * was resolvable. Resolution cannot proceed without at least one registered member.
 */
export class NoSatisfiableUnionError extends DiError {
  public constructor(public readonly members: readonly DepSlot[]) {
    const memberList = members
      .map((m) => (typeof m === 'string' ? `"${m}"` : JSON.stringify(m)))
      .join(', ');
    super(
      `No satisfiable union member found. Tried: [${memberList}]. `
        + `Register at least one of the union members before resolving.`,
    );
  }
}

/**
 * A token that still contains holes (`$N`) was resolved. An open template is
 * not a resolvable token — it names a FAMILY of tokens, one per closing. The
 * caller must close it first (substitute every hole with a concrete arg token).
 */
export class OpenTokenResolutionError extends DiError {
  public constructor(public readonly token: Token) {
    super(
      `Cannot resolve open template "${token}": it still contains holes `
        + `($N). Close the template first — resolve a concrete closing like `
        + `"base<arg>" (see closeToken), not the template itself.`,
    );
  }
}

/**
 * A scope-tagged registration was resolved with `validateScopes` on and NO
 * matching frame open in the owning chain — the resolution would silently fall
 * back to a transient instance, which scope validation makes loud instead.
 *
 * The engine's analog of the reference validator's three failures, told apart
 * by the fields (each `undefined` field narrows the flavor):
 *
 *   - `consumer` set — "scoped consumed by a singleton": the tagged service was
 *     a dependency of an instance OWNED by a frame whose chain has no `scope`
 *     frame, so the consumer would capture a fresh transient.
 *   - `consumer` unset, `requested` ≠ `token` — "scoped required from the root
 *     provider": a transient chain starting at `requested` reached the tagged
 *     service with no `scope` frame open at the vantage.
 *   - otherwise — "scoped resolved from the root provider": the tagged service
 *     was requested directly with no `scope` frame open.
 */
export class ScopeValidationError extends DiError {
  public constructor(
    /** The scope-tagged service that found no matching open frame. */
    public readonly token: Token,
    /** The registration's scope tag (the frame name that is not open). */
    public readonly scope: string,
    /**
     * The nearest enclosing OWNED (frame-cached) instance consuming `token` —
     * its token and the scope owning it — when the violation happened inside
     * a construction: the reference validator's "singleton" party.
     */
    public readonly consumer?: { readonly token: Token; readonly scope: string; },
    /** The token the triggering `resolve()` call originally requested. */
    public readonly requested?: Token,
  ) {
    super(
      consumer !== undefined
        ? `Cannot consume "${scope}"-scoped service "${token}" from `
          + `"${consumer.scope}"-owned "${consumer.token}": no "${scope}" `
          + `scope is open in the consumer's owning chain, so the dependency `
          + `would resolve transiently and be captured for the consumer's `
          + `whole lifetime.`
        : requested !== undefined && requested !== token
        ? `Cannot resolve "${requested}" from this provider: it requires `
          + `"${scope}"-scoped service "${token}" and no "${scope}" scope is `
          + `open. Open one with createScope("${scope}") first.`
        : `Cannot resolve "${scope}"-scoped service "${token}" from this `
          + `provider: no "${scope}" scope is open. Open one with `
          + `createScope("${scope}") first.`,
    );
  }
}

/**
 * One registration failed the eager `validateOnBuild` pass. Wraps the
 * underlying failure (available as `cause`), naming the registration's token —
 * the reference's per-descriptor "Error while validating the service
 * descriptor" wrapper. `build()` collects these into one `AggregateError`.
 */
export class RegistrationValidationError extends DiError {
  public constructor(
    public readonly token: Token,
    cause: unknown,
  ) {
    super(
      `Error while validating the registration for "${token}": ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
    this.cause = cause;
  }
}

/**
 * Sync `dispose()` was called on a scope that owns a Promise-valued (thenable)
 * cached instance. A pending Promise cannot be disposed synchronously — the
 * caller must use `disposeAsync()`.
 */
export class AsyncDisposalRequiredError extends DiError {
  public constructor() {
    super(
      `Cannot dispose synchronously: this scope owns a Promise-valued `
        + `instance (an async useFactory result). Awaiting it is required `
        + `before disposal — call disposeAsync() instead of dispose().`,
    );
  }
}

/**
 * Sync `resolve()` met an async result: a cached in-flight async construction
 * (a concurrent `resolveAsync` is mid-build). The instance cannot be produced
 * synchronously — use `resolveAsync()`.
 */
export class AsyncResolutionRequiredError extends DiError {
  public constructor(public readonly token: Token) {
    super(
      `"${token}" is resolving asynchronously (an async construction is in `
        + `flight for it). It cannot be returned synchronously — use `
        + `resolveAsync() instead of resolve().`,
    );
  }
}
