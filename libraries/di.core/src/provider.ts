// The PUBLIC provider surface — the interfaces a di consumer programs against.
// `@rhombus-std/di` supplies the implementation; `build()` and `createScope()`
// hand back these interfaces, never the impl class.

import type { Token } from './types.js';

/**
 * The throwing resolution surface: `resolve` throws when the token is
 * unregistered, against `tryResolve`'s nullable miss.
 */
export interface IRequiredResolver {
  /**
   * Keyed PLURAL resolve — scans `token`'s key-space and returns EVERY
   * registration whose key portion matches `pattern`, in registration order,
   * each honoring its own registration's lifetime. A dot-plus pattern matches
   * "any with a (non-empty) key"; a dot-star pattern matches "true any" (the
   * bare non-keyed token included). 0 matches yields `[]` — never throws on
   * count. The scan is confined to the FIXED `token` base (bare `token` or
   * `token + "#" + key`), so it can never wander into a collection-wrapper
   * (`Array<token>`) or a different type.
   */
  resolve<T>(token: Token, pattern: RegExp): T[];
  resolve(token: Token, pattern: RegExp): unknown[];
  /**
   * Keyed SINGULAR resolve — composes the lookup token `key === "" ? token :
   * token + "#" + key` and runs the ordinary exact lookup. `key` defaults to
   * `""` (the bare non-keyed token), so the single-argument call is unchanged.
   * A keyed token is an ordinary token; keyed registration is `add(token +
   * "#" + key, Impl)`.
   */
  resolve<T>(token: Token, key?: string): T;
  resolve(token: Token, key?: string): unknown;
}

/**
 * A token-based registration predicate: `true` when `token` would resolve (a
 * registration exists, directly or via an open-generic closing) — the keyed case
 * included, since the key rides in the token.
 *
 * @remarks
 * Does NOT attempt construction: a registered token whose dependencies are
 * missing still reports `true` (it IS a service; building it is a separate
 * concern).
 */
export interface IServiceQuery {
  isService(token: Token): boolean;
}

/**
 * The minimal resolution surface — resolve tokens and get factories.
 *
 * @remarks
 * A factory (or ctor) parameter typed `IResolver` is injected with the live
 * provider view relative to the resolving frame; "I want the provider" is plain
 * DI, not a dedicated slot kind.
 */
export interface IResolver extends IRequiredResolver, IServiceQuery {
  /**
   * Resolves asynchronously — the only path that may satisfy `T` via a
   * `Promise<T>` registration. Always returns a Promise; a lookup miss whose
   * honest `Promise<T>` registration exists is awaited and delivers `T`.
   */
  resolveAsync<T>(token: Token): Promise<T>;
  resolveAsync(token: Token): Promise<unknown>;
  /**
   * Keyed PLURAL non-throwing resolve — the `tryResolve` parity of the keyed
   * plural `resolve`. Scans `token`'s key-space and returns every match in
   * registration order; 0 matches yields `[]`.
   */
  tryResolve<T>(token: Token, pattern: RegExp): T[];
  tryResolve(token: Token, pattern: RegExp): unknown[];
  /**
   * Keyed SINGULAR non-throwing resolve — composes `key === "" ? token : token
   * + "#" + key` and probes it, yielding `undefined` when that composed token is
   * UNREGISTERED. `key` defaults to `""`, so the single-argument call is
   * unchanged.
   *
   * @remarks
   * A bare nullable, not a tuple: a resolved service is always a truthy
   * instance, so `undefined` unambiguously means "not registered".
   *
   * Only an unregistered token yields `undefined`. A registered token whose
   * construction fails for another reason (a missing dependency, a cycle, an
   * async-only construction) throws exactly as `resolve` would.
   */
  tryResolve<T>(token: Token, key?: string): T | undefined;
  tryResolve(token: Token, key?: string): unknown;
  /**
   * Returns a FACTORY for `type` rather than an instance. With `params` absent
   * or empty the result is a strict zero-arg `() => T` — every ctor slot must
   * resolve from the container. Otherwise `params` is the complete
   * authored-order list of caller-supplied parameter tokens and the factory has
   * shape `(...params) => T`.
   *
   * @typeParam F - the factory's own function type, e.g.
   * `resolveFactory<(a: A) => T>(…)` for a typed callable instead of `unknown`.
   * Compile-time only; the runtime is identical either way.
   */
  resolveFactory<F>(type: Token, params?: readonly Token[]): F;
  resolveFactory(type: Token, params?: readonly Token[]): unknown;
}

/**
 * The scope-creation surface. Injected into factory parameters typed
 * `IScopeFactory`, and implemented by the provider.
 */
export interface IScopeFactory<S extends string = string> {
  createScope(...args: 'scoped' extends S ? [name?: S] : [name: S]): IServiceProvider<S>;
}

/**
 * The container a consumer holds: resolution (`IResolver`), scope creation
 * (`IScopeFactory`), and native `Disposable` / `AsyncDisposable`.
 *
 * @typeParam S - the user-declared scope-name union.
 */
export interface IServiceProvider<S extends string = string>
  extends IResolver, IScopeFactory<S>, Disposable, AsyncDisposable {
  /**
   * The name of this provider's open scope frame. Throws if the provider is
   * frameless (no scope open — e.g. the provider straight from `build()`).
   */
  readonly name: S;
  /**
   * Closes this provider synchronously, disposing the instances its scope frame
   * owns in reverse construction order. Throws `AsyncDisposalRequiredError` if an
   * owned instance is a pending Promise. Idempotent.
   */
  dispose(): void;
  /**
   * Closes this provider asynchronously, awaiting owned Promise-valued instances
   * before disposing them in reverse construction order. Idempotent.
   */
  disposeAsync(): Promise<void>;
}

/**
 * The named lifetime tag for a registration. `"singleton"` and `"transient"`
 * are the built-in names; `U` is the user-declared scope-name union (defaults
 * to `"scoped"`). Transient is represented by the ABSENCE of a lifetime tag
 * (`undefined` on the registration), not by the string `"transient"`.
 */
export type Lifetime<U extends string = 'scoped'> = 'singleton' | 'transient' | U;
