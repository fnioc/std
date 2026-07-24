// The PUBLIC provider surface — the interface a di consumer programs against.
//
// This mirrors the reference runtime's MEDI / MEDI.Abstractions split: consumers hold the
// `IServiceProvider` INTERFACE (declared in the abstractions package), while the
// concrete `IServiceProvider` is an internal implementation detail of the
// non-abstractions runtime package. Here the same shape applies — `di.core`
// owns the `IServiceProvider` interface (plus the `IResolver` / `IScopeFactory`
// seams it composes); `@rhombus-std/di`'s `ServiceProviderClass` is the internal
// impl that `implements` it, and `build()` / `createScope()` return the
// interface, never the class.
//
// Every export here is pure type-level machinery — it erases completely.

import type { Token } from './types.js';

/**
 * The throwing required-resolution surface — the reference `ISupportRequiredService`
 * analog. `resolve` throws when the token is unregistered (against `tryResolve`'s
 * nullable miss).
 *
 * `resolve` has two published shapes; the tokenless authoring form `resolve<T>()`
 * (and the factory form `resolve<F>()`) is a PURE TYPING the
 * `@rhombus-std/di.extras` DECLARATION-MERGES onto THIS interface (via
 * `declare module "@rhombus-std/di.core"`), so it lights up only when the transformer
 * is in the TypeScript program. Merging onto the interface that DECLARES `resolve`
 * (rather than a separate carrier) is what lets a factory parameter typed `IResolver`
 * AND the `IServiceProvider` interface a consumer holds pick up the authored form — an
 * interface inherits a base interface's merged overloads; a class would not, which is
 * exactly why the public provider surface is this interface, not the impl class.
 *   - `resolve<T>(token)`   — explicit token, typed return.
 *   - `resolve(token)`      — explicit token, `unknown` return (dynamic).
 */
export interface IRequiredResolver {
  /**
   * Keyed PLURAL resolve — scans `token`'s key-space and returns EVERY
   * registration whose key portion matches `pattern`, in registration order,
   * each honoring its own registration's lifetime. A dot-plus pattern matches
   * "any with a (non-empty) key"; a dot-star pattern matches "true any" (the
   * bare non-keyed token included); a specific pattern matches those keys.
   * 0 matches yields `[]` — never throws on count. The scan is confined to the
   * FIXED `token` base (bare `token` or `token + "#" + key`), so it can never
   * wander into a collection-wrapper (`Array<token>`) or a different type.
   */
  resolve<T>(token: Token, pattern: RegExp): T[];
  resolve(token: Token, pattern: RegExp): unknown[];
  /**
   * Keyed SINGULAR resolve — composes the lookup token `key === "" ? token :
   * token + "#" + key` and runs the ordinary exact lookup. `key` defaults to
   * `""` (the bare non-keyed token), so the single-argument call is unchanged.
   * A keyed token is an ordinary token; keyed registration is `add(token +
   * "#" + key, Impl)`.
   *   - `resolve<T>(token, key?)` — explicit token + key, typed return.
   *   - `resolve(token, key?)`    — explicit token + key, `unknown` return.
   */
  resolve<T>(token: Token, key?: string): T;
  resolve(token: Token, key?: string): unknown;
}

/**
 * The registration-query surface — the reference `IServiceProviderIsService` analog.
 * A token-based predicate: `true` when `token` would resolve (a registration exists,
 * directly or via an open-generic closing), `false` otherwise. Being token-based, it
 * also covers the keyed case in one method. Does NOT attempt construction — a
 * registered token whose dependencies are missing still reports `true` (it IS a
 * service; building it is a separate concern).
 *
 * The tokenless authoring form `isService<T>()` is the pure typing the
 * `@rhombus-std/di.extras` DECLARATION-MERGES onto this interface.
 */
export interface IServiceQuery {
  isService(token: Token): boolean;
}

/**
 * The minimal resolution surface — resolve tokens and get factories. A factory
 * (or ctor) parameter typed `IResolver` is injected with the live provider view:
 * the type derives the intrinsic provider token (`RESOLVER_TOKEN`), which the
 * engine resolves to the view relative to the resolving frame — "I want the
 * provider" is plain DI, no dedicated slot kind.
 *
 * Composes the named reference capability analogs — `IRequiredResolver`
 * (`ISupportRequiredService`) and `IServiceQuery` (`IServiceProviderIsService`) — while
 * staying ONE bundled surface a consumer programs against; `resolveAsync`, `tryResolve`,
 * and `resolveFactory` are declared here directly.
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
   * Non-throwing resolve — returns the resolved instance, or `undefined` when
   * `token` is UNREGISTERED. Mirrors the reference DI's nullable `GetService<T>`
   * against `resolve`'s throwing `GetRequiredService` (#25). A bare nullable, not
   * a tuple: a resolved service is always a truthy instance, so `undefined`
   * unambiguously means "not registered".
   *
   * Only an unregistered TOKEN yields `undefined`. A registered token whose
   * construction fails for another reason (a missing dependency, a cycle, an
   * async-only construction) throws exactly as `resolve` would — `tryResolve`
   * softens the "is it registered?" miss, nothing else.
   *
   * The tokenless authoring form `tryResolve<T>()` is the pure typing the
   * `@rhombus-std/di.extras` DECLARATION-MERGES onto this interface.
   *   - `tryResolve<T>(token)` — explicit token, typed nullable return.
   *   - `tryResolve(token)`    — explicit token, `unknown` return (dynamic).
   */
  /**
   * Keyed PLURAL non-throwing resolve — the `tryResolve` parity of the keyed
   * plural `resolve`. Scans `token`'s key-space and returns every match in
   * registration order; 0 matches yields `[]`.
   */
  tryResolve<T>(token: Token, pattern: RegExp): T[];
  tryResolve(token: Token, pattern: RegExp): unknown[];
  /**
   * Keyed SINGULAR non-throwing resolve — composes `key === "" ? token : token
   * + "#" + key` and probes it; `undefined` when the composed token is
   * unregistered. `key` defaults to `""`, so the single-argument call is
   * unchanged.
   *   - `tryResolve<T>(token, key?)` — explicit token + key, typed nullable.
   *   - `tryResolve(token, key?)`    — explicit token + key, `unknown` return.
   */
  tryResolve<T>(token: Token, key?: string): T | undefined;
  tryResolve(token: Token, key?: string): unknown;
  /**
   * Returns a FACTORY for `type` rather than an instance. When `params` is
   * absent or empty, returns a strict zero-arg `() => T` — every ctor slot must
   * resolve from the container. When `params` is present, it is the complete
   * authored-order list of caller-supplied parameter tokens; the returned factory
   * has shape `(...params) => T`. The authored `resolve<(a: A) => T>()` lowers
   * to `resolveFactory("pkg:T", ["pkg:A"])`.
   *
   * `F` is the factory's own function type — the reference `ObjectFactory` return
   * analog. A hand-written caller passes it (`resolveFactory<(a: A) => T>(…)`) to
   * get a typed callable back instead of `unknown`; the runtime is identical, so
   * the type parameter is compile-time only. The bare `unknown` fallback is the
   * dynamic form. Overload order mirrors `resolve<T>` / `resolve`.
   *   - `resolveFactory<F>(type, params?)` — typed factory return.
   *   - `resolveFactory(type, params?)`    — `unknown` return (dynamic).
   */
  resolveFactory<F>(type: Token, params?: readonly Token[]): F;
  resolveFactory(type: Token, params?: readonly Token[]): unknown;
}

/**
 * The scope-creation surface. Injected into factory parameters typed
 * `IScopeFactory`, and implemented by the provider impl. `createScope` returns
 * the `IServiceProvider` INTERFACE (the abstractions seam), never the impl class.
 */
export interface IScopeFactory<S extends string = string> {
  createScope(
    ...args: 'scoped' extends S ? [name?: S] : [name: S]
  ): IServiceProvider<S>;
}

/**
 * The PUBLIC container surface a consumer holds — the abstractions seam mirroring
 * MEDI's `IServiceProvider`. Composes the resolution surface (`IResolver`, which
 * carries the tokenless authoring forms via `ResolverAuthoring`), scope creation
 * (`IScopeFactory`), and native `Disposable` / `AsyncDisposable`. The concrete
 * `ServiceProviderClass` in `@rhombus-std/di` implements this; `build()` and
 * `createScope()` return it rather than the class so consumers program against
 * the interface.
 *
 * `S` is the user-declared scope-name union.
 */
export interface IServiceProvider<S extends string = string>
  extends IResolver, IScopeFactory<S>, Disposable, AsyncDisposable
{
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
 * @deprecated Use `IResolver` instead. Kept for backwards compatibility.
 *
 * The resolution surface a factory receives when it declares a provider-typed
 * parameter. Like `IResolver`, its token is intrinsic — the engine fills the
 * parameter with the live provider view — with `createScope` added.
 */
export interface IResolveScope extends IResolver {
  createScope(name: string): IServiceProvider;
}

/**
 * The named lifetime tag for a registration. `"singleton"` and `"transient"`
 * are the built-in names; `U` is the user-declared scope-name union (defaults
 * to `"scoped"`). Transient is represented by the ABSENCE of a lifetime tag
 * (`undefined` on the registration), not by the string `"transient"`.
 */
export type Lifetime<U extends string = 'scoped'> = 'singleton' | 'transient' | U;
