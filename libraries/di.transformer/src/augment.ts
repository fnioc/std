// Type-only authoring surface contributed to `@rhombus-std/di.core` by the transformer.
//
// These generic, token-free forms (`add<I>(C)`, `add<I>(fn)`, `addValue<I>(v)`,
// `.as<"scope">()`, `resolve<T>()`, `resolveAsync<T>()`) NEVER execute: the @rhombus-std/di.transformer
// rewrites every such call to its explicit-token / value-arg form before
// runtime. They are therefore PURE TYPINGS, and they live here rather than in
// core's published types so that the authoring surface lights up only when the
// transformer is in the TypeScript program. Without the transformer, these
// forms don't exist on the surface — which is the truth at runtime tool-free,
// and which kills the "compiles but throws at runtime" footgun.
//
// The augmentation DECLARATION-MERGES onto `@rhombus-std/di.core`'s public
// interfaces — `IServiceManifestBase` (registration forms), `AddBuilder` (the
// `.as` form), and the resolution surface `IResolver` composes: `IRequiredResolver`
// (the tokenless `resolve` forms), `IServiceQuery` (`isService`), and `IResolver`
// itself (`resolveAsync` / `tryResolve`). Each tokenless overload merges onto the
// interface that DECLARES its explicit-token form, so the two combine on one
// interface. Because di's consumer-facing types are those interfaces
// (interface-first: `ServiceManifest` = `IServiceManifestBase<…>`, and the public
// provider is the `IServiceProvider` interface that extends `IResolver`), the merged
// overloads surface on what a consumer holds — an interface inherits a base
// interface's merged overloads; a class would not. Declaration merging (adding overloads to the SAME interface)
// is used rather than a separate carrier + `extends`, because the runtime forms
// (`add(token, ctor, sig)`, `.as(scope)`, `resolve<T>(token)`) require MORE args
// than the authored forms, and `extends` would reject the narrower authored
// signature as incompatible — merging composes them as overloads instead. This
// is why the transformer depends on `@rhombus-std/di.core` ALONE — it never
// references di's runtime classes.
//
// This module must be reachable from @rhombus-std/di.transformer's published types entry
// (it is `import`ed for its side effect from `./index.ts`) so that a consumer
// referencing `@rhombus-std/di.transformer` pulls the augmentation into its program.

import type { Ctor, Func } from '@rhombus-toolkit/func';
// The `AddBuilder<Scopes>` continuation type the registration forms return. A
// named import (not a member reference inside the augmentation block) because
// unqualified names in a `declare module` body resolve in THIS file's scope.
import type { AddBuilder } from '@rhombus-std/di.core';

// Re-export the authoring brand types so transformer consumers can use
// `Inject<T, "tok">`, the open-generics placeholders (`Hole<N, C>`, `$<N>`)
// and the `Typeof<T>` witness without importing from `@rhombus-std/di.core`
// directly. The overload-faithful `OverloadedParameters` / `OverloadedConstructorParameters`
// ride along too — they type a factory rest parameter so an overloaded ctor
// lowers to one dep signature per overload. A single import of
// `@rhombus-std/di.transformer` brings both the transformer plugin and these types into scope.
export type { $, Hole, Inject, OverloadedConstructorParameters, OverloadedParameters,
  Typeof } from '@rhombus-std/di.core';

declare module '@rhombus-std/di.core' {
  // The type-driven registration forms merge onto core's `IServiceManifestBase`
  // interface — which the public `ServiceManifest` (`= IServiceManifestBase<…>`) a
  // consumer holds resolves to. `Provider` is defaulted so the merge matches the
  // interface's type-parameter list.
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
    /**
     * Type-driven class authoring — lowers to `add("token", C)`. The ctor is
     * typed `Ctor<any[], I>` (a plain construct signature, so an abstract class
     * is rejected). Never runs post-transform.
     *
     * A GENERIC impl is authored as an instantiation expression —
     * `add<IRepo<$<1>>>(SqlRepository<$<1>>)` (open template) or
     * `add<IRepo<User>>(SqlRepository<User>)` (closed) — and lowers to
     * `add("token", C, signatures)` with its dep signatures carried on the
     * registration (type args stripped from the emitted ctor).
     */
    add<I>(ctor: Ctor<any[], I>): AddBuilder<Scopes>;
    /**
     * Registration-time override form — a sparse positional override array for a
     * class whose ctor you can't edit (third-party / generic). Each element
     * overrides the transformer-derived token at that position; `undefined` (or
     * an array hole) keeps the derived token. Lowers to
     * `add("token", C, [[...merged...]])`. Never runs post-transform.
     *
     *   add<ICache>(RedisCache, ["pkg:IRedisClient", undefined, "pkg:ILogger"])
     */
    add<I>(
      ctor: Ctor<any[], I>,
      overrides: readonly (string | undefined)[],
    ): AddBuilder<Scopes>;
    /**
     * Type-driven factory authoring — lowers to `addFactory("token", fn)` (the
     * transformer knows the arg is a function). Never runs post-transform.
     */
    add<I>(factory: Func<any[], I>): AddBuilder<Scopes>;
    /**
     * Type-driven factory authoring, EXPLICIT form — `addFactory<I>(fn)` lowers to
     * `addFactory("token", fn)`. Mirrors `add<I>(factory)`; the explicit method
     * name documents intent at the call site (a factory, never a class). It
     * coexists with di's runtime `addFactory(token, factory, signatures?)` overload
     * — arity disambiguates (one value arg here vs. the runtime form's leading
     * string token). Never runs post-transform.
     */
    addFactory<I>(factory: Func<any[], I>): AddBuilder<Scopes>;
    /**
     * Type-driven value authoring — lowers to `addValue("token", v)`. Never runs
     * post-transform.
     */
    addValue<I>(value: I): void;
  }

  // The authored lifetime form merges onto core's `AddBuilder` interface — the
  // continuation the registration forms return.
  interface AddBuilder<Scopes extends string> {
    /**
     * The AUTHORED lifetime form — `.as<"singleton">()`. The scope name is a
     * TYPE argument; the `S extends Scopes` bound is the compile-time
     * captive-misconfiguration guard. The transformer rewrites it to the
     * value-arg `.as("singleton")` before it runs.
     */
    as<S extends Scopes>(): void;
  }

  // The tokenless resolve forms merge onto the SAME di.core interface that DECLARES
  // each method — `resolve` onto `IRequiredResolver`, `isService` onto `IServiceQuery`,
  // and `resolveAsync`/`tryResolve` onto `IResolver` — so each authored overload
  // combines with the explicit-token form it shadows on one interface (an overload
  // merged onto a DERIVED interface would not combine with a base's declaration).
  // `IResolver` composes `IRequiredResolver` + `IServiceQuery`, so both a factory
  // parameter typed `IResolver` and the `IServiceProvider` interface a consumer holds
  // (which extends `IResolver`) inherit the full merged overload set. The public
  // provider being an INTERFACE (not the impl class) is what makes this work: an
  // interface inherits its base interface's merged overloads; a class would not.
  interface IRequiredResolver {
    /**
     * Tokenless authored resolve — `resolve<IFoo>()`. The transformer lowers it
     * to an explicit-token `resolve("token")` (or `resolveFactory` for a
     * function-typed arg) before runtime.
     */
    resolve<T>(): T;
    /**
     * Tokenless authored factory resolve — `resolve<(a: A, b: B) => T>()`. The
     * transformer lowers it to `resolveFactory("T-token", ["A-token", "B-token"])`.
     * Zero-param form `resolve<() => T>()` lowers to `resolveFactory("T-token")`.
     * Never runs post-transform.
     */
    resolve<F extends (...args: any[]) => any>(): ReturnType<F>;
  }

  interface IServiceQuery {
    /**
     * Tokenless registration predicate — `isService<IFoo>()`. `true` when `IFoo`
     * would resolve. The transformer lowers it to an explicit-token
     * `isService("token")` before runtime (the token is always derived — no
     * singleton or factory form). Never runs post-transform.
     */
    isService<T>(): boolean;
  }

  interface IResolver {
    /**
     * Tokenless async resolve — `resolveAsync<IFoo>()`. The transformer lowers
     * it to an explicit-token `resolveAsync("token")` before runtime — the
     * same rewrite `resolve<T>()` gets, keyed on `resolveAsync` instead. Parity
     * with the sync form: the whole point of the with-transformer authoring
     * surface is that no resolve call ever needs a hand-written token.
     */
    resolveAsync<T>(): Promise<T>;
    /**
     * Tokenless async factory resolve — lowered mirroring `resolve<F>()`'s
     * factory form. Never runs post-transform.
     */
    resolveAsync<F extends (...args: any[]) => any>(): Promise<Awaited<ReturnType<F>>>;
    /**
     * Tokenless non-throwing resolve — `tryResolve<IFoo>()`. Returns the instance
     * or `undefined` when unregistered. The transformer lowers it to an
     * explicit-token `tryResolve("token")` before runtime — the same rewrite
     * `resolve<T>()` gets, keyed on `tryResolve`. Never runs post-transform.
     */
    tryResolve<T>(): T | undefined;
  }
}
