// The PUBLIC provider surface — the interface a di consumer programs against.
//
// This mirrors the reference runtime's MEDI / MEDI.Abstractions split: consumers hold the
// `IServiceProvider` INTERFACE (declared in the abstractions package), while the
// concrete `ServiceProvider` is an internal implementation detail of the
// non-abstractions runtime package. Here the same shape applies — `di.core`
// owns the `ServiceProvider` interface (plus the `Resolver` / `ScopeFactory`
// seams it composes); `@rhombus-std/di`'s `ServiceProviderClass` is the internal
// impl that `implements` it, and `build()` / `createScope()` return the
// interface, never the class.
//
// Every export here is pure type-level machinery — it erases completely.

import type { Token } from "./types.js";

/**
 * The minimal resolution surface — resolve tokens and get factories. A factory
 * (or ctor) parameter typed `Resolver` is injected with the live provider view:
 * the type derives the intrinsic provider token (`RESOLVER_TOKEN`), which the
 * engine resolves to the view relative to the resolving frame — "I want the
 * provider" is plain DI, no dedicated slot kind.
 *
 * `resolve` has two published shapes here; the tokenless authoring form
 * `resolve<T>()` (and the factory form `resolve<F>()`) is a PURE TYPING the
 * `@rhombus-std/di.transformer` DECLARATION-MERGES onto THIS interface (via
 * `declare module "@rhombus-std/di.core"`), so it lights up only when the
 * transformer is in the TypeScript program. Merging onto the interface (rather
 * than a separate carrier) is what lets both a factory parameter typed `Resolver`
 * AND the `ServiceProvider` interface a consumer holds pick up the authored form
 * — an interface inherits a base interface's merged overloads; a class would not,
 * which is exactly why the public provider surface is this interface, not the
 * impl class.
 *   - `resolve<T>(token)`   — explicit token, typed return.
 *   - `resolve(token)`      — explicit token, `unknown` return (dynamic).
 */
export interface Resolver {
  resolve<T>(token: Token): T;
  resolve(token: Token): unknown;
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
   * `@rhombus-std/di.transformer` DECLARATION-MERGES onto this interface.
   *   - `tryResolve<T>(token)` — explicit token, typed nullable return.
   *   - `tryResolve(token)`    — explicit token, `unknown` return (dynamic).
   */
  tryResolve<T>(token: Token): T | undefined;
  tryResolve(token: Token): unknown;
  /**
   * A token-based registration predicate — `true` when `token` would resolve
   * (a registration exists, directly or via an open-generic closing), `false`
   * otherwise. Mirrors the reference DI's `IServiceProviderIsService.IsService`
   * (#23); being token-based, it also covers the keyed case in one method. Does
   * NOT attempt construction — a registered token whose dependencies are missing
   * still reports `true` (it IS a service; building it is a separate concern).
   *
   * The tokenless authoring form `isService<T>()` is the pure typing the
   * `@rhombus-std/di.transformer` DECLARATION-MERGES onto this interface.
   */
  isService(token: Token): boolean;
  /**
   * Returns a FACTORY for `type` rather than an instance. When `params` is
   * absent or empty, returns a strict zero-arg `() => T` — every ctor slot must
   * resolve from the container. When `params` is present, it is the complete
   * authored-order list of caller-supplied parameter tokens; the returned factory
   * has shape `(...params) => T`. The authored `resolve<(a: A) => T>()` lowers
   * to `resolveFactory("pkg:T", ["pkg:A"])`.
   */
  resolveFactory(type: Token, params?: readonly Token[]): unknown;
}

/**
 * The scope-creation surface. Injected into factory parameters typed
 * `ScopeFactory`, and implemented by the provider impl. `createScope` returns
 * the `ServiceProvider` INTERFACE (the abstractions seam), never the impl class.
 */
export interface ScopeFactory<S extends string = string> {
  createScope(
    ...args: "scoped" extends S ? [name?: S] : [name: S]
  ): ServiceProvider<S>;
}

/**
 * The PUBLIC container surface a consumer holds — the abstractions seam mirroring
 * MEDI's `IServiceProvider`. Composes the resolution surface (`Resolver`, which
 * carries the tokenless authoring forms via `ResolverAuthoring`), scope creation
 * (`ScopeFactory`), and native `Disposable` / `AsyncDisposable`. The concrete
 * `ServiceProviderClass` in `@rhombus-std/di` implements this; `build()` and
 * `createScope()` return it rather than the class so consumers program against
 * the interface.
 *
 * `S` is the user-declared scope-name union.
 */
export interface ServiceProvider<S extends string = string>
  extends Resolver, ScopeFactory<S>, Disposable, AsyncDisposable
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
 * @deprecated Use `Resolver` instead. Kept for backwards compatibility.
 *
 * The resolution surface a factory receives when it declares a provider-typed
 * parameter. Like `Resolver`, its token is intrinsic — the engine fills the
 * parameter with the live provider view — with `createScope` added.
 */
export interface ResolveScope extends Resolver {
  createScope(name: string): ServiceProvider;
}

/**
 * The named lifetime tag for a registration. `"singleton"` and `"transient"`
 * are the built-in names; `U` is the user-declared scope-name union (defaults
 * to `"scoped"`). Transient is represented by the ABSENCE of a lifetime tag
 * (`undefined` on the registration), not by the string `"transient"`.
 */
export type Lifetime<U extends string = "scoped"> = "singleton" | "transient" | U;
