// Additional overloads on `@rhombus-std/di.core`'s registration, lifetime and
// resolve interfaces, each taking the service type as a type argument in place
// of a token. They are declared on the interfaces a consumer already holds
// (`IServiceManifestBase`, `IResolver`, …), so a bare side-effect import of
// `@rhombus-std/di.extras` brings every one of them into scope at once.
//
// The declarations carry no implementation: the receiver's own member is what
// runs, and it throws when handed the type-argument form.

import type { AddChain, IServiceManifest, Slot } from '@rhombus-std/di.core';
import type { Ctor, Func } from '@rhombus-toolkit/func';

/** Re-exported so a consumer doesn't need a separate import from `@rhombus-std/di.core`. */
export type { $, Hole, Inject, Typeof } from '@rhombus-std/di.core';

declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
    /** Registers `ctor` under its own token — the instance it builds. */
    addClass(ctor: Ctor<any[], unknown>): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', false>;
    /**
     * Registers `ctor` against `I`.
     *
     * @example
     * A generic implementation is written as an instantiation expression:
     * ```ts
     * addClass<IRepo<$<1>>>(SqlRepository<$<1>>)   // open template
     * addClass<IRepo<User>>(SqlRepository<User>)   // closed
     * ```
     */
    addClass<I>(ctor: Ctor<any[], I>): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', false>;
    /** Equivalent to `addClass<I>(ctor).as(scope)`. */
    addClass<I>(ctor: Ctor<any[], I>, scope: Scopes): AddChain<Scopes, 'signature' | 'signatures' | 'key', false>;
    /** Equivalent to `addClass<I>(ctor).as(scope)`, with a registration key. */
    addClass<I>(ctor: Ctor<any[], I>, scope: Scopes, key: string): AddChain<Scopes, 'signature' | 'signatures', false>;
    /**
     * Registers `ctor` against `I`, overriding its derived dependency tokens
     * position by position — useful when `ctor` is third-party or generic and
     * can't otherwise be annotated. A hole in `overrides` keeps the derived
     * token; an explicit `undefined` clears the slot.
     *
     * @example
     * ```ts
     * addClass<ICache>(RedisCache, ["pkg:IRedisClient", , "pkg:ILogger"]) // hole keeps arg 1
     * ```
     */
    addClass<I>(ctor: Ctor<any[], I>,
      overrides: ReadonlyArray<string | undefined>
    ): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', false>;
    /** Registers `factory` under the token of the type it returns. */
    addFactory(factory: Func<any[], unknown>): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', false>;
    /** Registers `factory` against `I`. */
    addFactory<I>(factory: Func<any[], I>): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', false>;
    /** Equivalent to `addFactory<I>(factory).as(scope)`. */
    addFactory<I>(factory: Func<any[], I>, scope: Scopes): AddChain<Scopes, 'signature' | 'signatures' | 'key', false>;
    /** Equivalent to `addFactory<I>(factory).as(scope)`, with a registration key. */
    addFactory<I>(factory: Func<any[], I>, scope: Scopes,
      key: string): AddChain<Scopes, 'signature' | 'signatures', false>;
    /** Registers `value` under its own type's token. */
    addValue(value: unknown): IServiceManifest<Scopes>;
    /** Registers `value` against `I`. */
    addValue<I>(value: I): IServiceManifest<Scopes>;
  }

  interface IWithSignatureBuilder<S extends string, Slots extends Slot, Gated extends boolean> {
    /** Appends one overload's dependency slots, derived from the tuple `T`. */
    withSignature<T extends readonly any[]>(): AddChain<S, Exclude<Slots, 'signatures'>, Gated>;
  }

  interface IWithSignaturesBuilder<S extends string, Slots extends Slot, Gated extends boolean> {
    /** Replaces the whole signature set, derived from the tuple-of-tuples `T`. */
    withSignatures<T extends ReadonlyArray<readonly any[]>>(): AddChain<S, Exclude<Slots, 'signature' | 'signatures'>,
      Gated>;
  }

  interface IAsBuilder<S extends string, Slots extends Slot, Gated extends boolean> {
    /** Sets the lifetime to `Scope`. The `Scope extends S` bound catches an invalid scope name at compile time. */
    as<Scope extends S>(): AddChain<S, Exclude<Slots, 'scope'>, Gated>;
  }

  interface IRequiredResolver {
    /** Resolves the registered instance for `T`. */
    resolve<T>(): T;
    /**
     * Resolves a factory shaped like `F` — `resolve<(a: A, b: B) => R>()`
     * resolves each parameter by its own type and builds `R`.
     */
    resolve<F extends (...args: any[]) => any>(): ReturnType<F>;
  }

  interface IServiceQuery {
    /** `true` when `T` would resolve. */
    isService<T>(): boolean;
  }

  interface IResolver {
    /** Resolves the registered instance for `T`, asynchronously. */
    resolveAsync<T>(): Promise<T>;
    /** The async counterpart of the factory form of {@link IRequiredResolver.resolve}. */
    resolveAsync<F extends (...args: any[]) => any>(): Promise<Awaited<ReturnType<F>>>;
    /** Resolves `T`, or `undefined` when it isn't registered. */
    tryResolve<T>(): T | undefined;
  }
}
