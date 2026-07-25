// The WHOLE DI error taxonomy: the `DiError` root, the registration-time errors
// the registration builder raises, and the resolution-time errors the engine
// raises. All of it lives in the abstractions package because classifying a
// failure is ordinary library work — a di.core-only library has to be able to
// `catch (e) { if (e instanceof UnregisteredTokenError) … }`, add context, and
// re-raise without taking a reference on the engine. `@rhombus-std/di` re-exports
// the taxonomy, so the classes are reachable through either import and there is
// exactly ONE runtime copy of each (di keeps di.core external in its bundle).
//
// Nothing here touches the engine: the classes carry tokens, slots and strings,
// and their messages are written for a human reading a stack trace at the moment
// a graph fails to resolve.

import type { DepSlot, Token } from './types.js';

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

// ---------------------------------------------------------------------------
// Resolution-time errors — raised by the engine, declared here so a
// di.core-only library can branch on them.
// ---------------------------------------------------------------------------

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
        + `(addClass(token, ctor, [[...]])), compile with @rhombus-std/di.extras, or `
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
 * but that token has no registration, so there is nothing for the injected
 * callable to build.
 *
 * `reason` carries the single value `"unregistered"`. It once also admitted
 * `"not-a-class"` — the old engine refused a factory over a value / factory
 * target because it built with a bare `new`. The three authoring kinds have
 * since collapsed into one `produce` closure, so a value target is simply a
 * zero-arg thunk returning the stored instance and the distinction has no
 * referent; the field stays (it is public surface, and it reads at a catch site)
 * rather than being dropped outright.
 */
export class FactoryTargetError extends DiError {
  public constructor(
    public readonly factoryToken: Token,
    public readonly reason: 'unregistered',
  ) {
    super(
      `Cannot inject a factory for "${factoryToken}": no registration found `
        + `for it. A factory parameter (typed \`() => IFoo\`) needs the target `
        + `registered with services.addClass(...) before it can build `
        + `instances.`,
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
 * A provider was used after `dispose()` / `disposeAsync()` closed it — the
 * reference container's `ObjectDisposedException` analog.
 *
 * Every resolution entry point is guarded, `createScope` included. A disposed
 * frame has already drained the instances it owned, and its bookkeeping is not
 * re-drained by a second `dispose()` (which is idempotent), so anything built
 * afterwards would be constructed, cached, and then silently leaked undisposed.
 */
export class ProviderDisposedError extends DiError {
  public constructor(public readonly operation: string) {
    super(
      `Cannot ${operation} on a disposed IServiceProvider. The scope has been `
        + `closed and its owned instances disposed; resolve from a live scope, `
        + `or open a fresh one with createScope(name).`,
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
