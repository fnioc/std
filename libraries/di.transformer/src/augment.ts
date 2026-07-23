// Type-only authoring surface contributed to `@rhombus-std/di.core` by the transformer.
//
// These generic, token-free forms (`addClass<I>(C)`, `addFactory<I>(fn)`,
// `addValue<I>(v)`, `.as<"scope">()`, `resolve<T>()`, `resolveAsync<T>()`) NEVER
// execute: the @rhombus-std/di.transformer rewrites every such call to its
// explicit-token / value-arg form before runtime. They are therefore PURE TYPINGS,
// and they live here rather than in core's published types so that the authoring
// surface lights up only when the transformer is in the TypeScript program. Without
// the transformer, these forms don't exist on the surface — which is the truth at
// runtime tool-free, and which kills the "compiles but throws at runtime" footgun.
//
// The augmentation DECLARATION-MERGES onto `@rhombus-std/di.core`'s public
// interfaces — `IServiceManifestBase` (registration forms), `IAsBuilder` (the
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
// (`addClass(token, ctor, sig)`, `.as(scope)`, `resolve<T>(token)`) require MORE args
// than the authored forms, and `extends` would reject the narrower authored
// signature as incompatible — merging composes them as overloads instead. This
// is why the transformer depends on `@rhombus-std/di.core` ALONE — it never
// references di's runtime classes.
//
// This module must be reachable from @rhombus-std/di.transformer's published types entry
// (it is `import`ed for its side effect from `./index.ts`) so that a consumer
// referencing `@rhombus-std/di.transformer` pulls the augmentation into its program.

import type { Ctor, Func } from '@rhombus-toolkit/func';
// The `AddChain<Scopes, Slots, Gated>` continuation type the registration forms
// return, the `Slot` union that indexes it, and the plain `IServiceManifest` a
// slotless verb hands back. Named imports (not member references inside the
// augmentation block) because unqualified names in a `declare module` body resolve
// in THIS file's scope. Every sugar chain is UNGATED (`Gated = false`): the
// transformer derives the signature from the type argument, so the manifest face is
// always present and `withSignature` / `withSignatures` are OVERRIDES, not a gate.
import type { AddChain, IServiceManifest, Slot } from '@rhombus-std/di.core';

// Re-export the authoring brand types so transformer consumers can use
// `Inject<T, "tok">`, the open-generics placeholders (`Hole<N, C>`, `$<N>`)
// and the `Typeof<T>` witness without importing from `@rhombus-std/di.core`
// directly. A single import of `@rhombus-std/di.transformer` brings both the
// transformer plugin and these types into scope.
export type { $, Hole, Inject, Typeof } from '@rhombus-std/di.core';

declare module '@rhombus-std/di.core' {
  // The type-driven registration forms merge onto core's `IServiceManifestBase`
  // interface — which the public `ServiceManifest` (`= IServiceManifestBase<…>`) a
  // consumer holds resolves to. `Provider` is defaulted so the merge matches the
  // interface's type-parameter list.
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
    /**
     * No-type-arg SELF-registration — `addClass(SqlUserRepo)` registers the class
     * under its OWN service token (the instance it builds), lowering to
     * `addClass("token", C, signatures)` exactly like the explicit form with the
     * token derived from the VALUE instead of a `<I>` type argument. It is the
     * form you reach for when the implementation IS the service (no separate
     * interface to register against). Never runs post-transform.
     *
     * Declared BEFORE the generic `addClass<I>(ctor)` so a no-type-arg call binds
     * this non-generic overload (TypeScript picks the first applicable overload in
     * declaration order); an explicit `addClass<ILogger>(C)` skips it — type
     * arguments are not applicable to a non-generic signature — and binds the
     * generic interface-registration form below.
     */
    addClass(ctor: Ctor<any[], unknown>): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', false>;
    /**
     * Type-driven class authoring — lowers to
     * `addClass("token", C, signatures)`. The ctor is typed `Ctor<any[], I>` (a
     * plain construct signature, so an abstract class is rejected). Never runs
     * post-transform.
     *
     * A GENERIC impl is authored as an instantiation expression —
     * `addClass<IRepo<$<1>>>(SqlRepository<$<1>>)` (open template) or
     * `addClass<IRepo<User>>(SqlRepository<User>)` (closed) — and lowers to
     * `addClass("token", C, signatures)` with its dep signatures carried on the
     * registration (type args stripped from the emitted ctor).
     *
     * The chain it hands back is UNGATED (`Gated = false`): the transformer already
     * injected a DERIVED signature, so the manifest face is present and both
     * `signature` (append) and `signatures` (replace) survive as OVERRIDES — an
     * authored `addClass<I>(C).withSignatures(custom)` lowers to
     * `addClass("token", C, custom)` and the modifier never reaches emitted JS.
     */
    addClass<I>(ctor: Ctor<any[], I>): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', false>;
    /**
     * Type-driven class authoring with the lifetime chosen POSITIONALLY —
     * `addClass<I>(C, "scoped")`. Equivalent to `addClass<I>(C).as("scoped")`, one
     * call instead of two. Never runs post-transform.
     */
    addClass<I>(ctor: Ctor<any[], I>, scope: Scopes): AddChain<Scopes, 'signature' | 'signatures' | 'key', false>;
    /**
     * Type-driven class authoring with lifetime AND registration key positionally
     * — `addClass<I>(C, "scoped", "audit")`, composing the keyed token `base#key`
     * (§98). Never runs post-transform.
     */
    addClass<I>(
      ctor: Ctor<any[], I>,
      scope: Scopes,
      key: string,
    ): AddChain<Scopes, 'signature' | 'signatures', false>;
    /**
     * Registration-time override form — a sparse positional override array for a
     * class whose ctor you can't edit (third-party / generic). Each element
     * overrides the transformer-derived token at that position; `undefined` (or
     * an array hole) keeps the derived token. Lowers to
     * `addClass("token", C, [[...merged...]])`. Never runs post-transform.
     *
     *   addClass<ICache>(RedisCache, ["pkg:IRedisClient", undefined, "pkg:ILogger"])
     */
    addClass<I>(
      ctor: Ctor<any[], I>,
      overrides: ReadonlyArray<string | undefined>,
    ): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', false>;
    /**
     * No-type-arg SELF-registration — `addFactory(makeThing)` registers the
     * factory under the service token of what it RETURNS, lowering to
     * `addFactory("token", fn, signatures)` with the token derived from the value.
     * Declared before the generic `addFactory<I>(fn)` for the same overload-order
     * reason as `addClass`. Never runs post-transform.
     */
    addFactory(factory: Func<any[], unknown>): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', false>;
    /**
     * Type-driven factory authoring — `addFactory<I>(fn)` lowers to
     * `addFactory("token", fn, signatures)`. It coexists with di's runtime
     * `addFactory(token, factory, signatures, …)` overloads — arity and the
     * leading string token disambiguate. Never runs post-transform.
     */
    addFactory<I>(factory: Func<any[], I>): AddChain<Scopes, 'signature' | 'signatures' | 'scope' | 'key', false>;
    /**
     * Type-driven factory authoring with the lifetime chosen POSITIONALLY.
     * Never runs post-transform.
     */
    addFactory<I>(
      factory: Func<any[], I>,
      scope: Scopes,
    ): AddChain<Scopes, 'signature' | 'signatures' | 'key', false>;
    /**
     * Type-driven factory authoring with lifetime AND registration key
     * positionally. Never runs post-transform.
     */
    addFactory<I>(
      factory: Func<any[], I>,
      scope: Scopes,
      key: string,
    ): AddChain<Scopes, 'signature' | 'signatures', false>;
    /**
     * No-type-arg SELF-registration — `addValue(config)` registers the value
     * under its OWN type's service token, lowering to `addValue("token", v)`. A
     * value carries no construct/call signature, so the token is the value's own
     * type. Declared before the generic `addValue<I>(value)` for the same
     * overload-order reason as `addClass`. Never runs post-transform.
     */
    addValue(value: unknown): IServiceManifest<Scopes>;
    /**
     * Type-driven value authoring — lowers to `addValue("token", v)`. A value
     * carries neither deps nor a lifetime, so no slot survives: it hands back the
     * plain new manifest, which the caller must KEEP. Never runs post-transform.
     */
    addValue<I>(value: I): IServiceManifest<Scopes>;
  }

  // The type-driven APPEND form merges onto core's `IWithSignatureBuilder` face —
  // the `signature` slot of the chain a registration returns. `withSignature<T>()`
  // derives ONE overload's dependency slots from the type tuple `T` and appends
  // them, lowering to `withSignature(...signaturefor<T>())` — the exact
  // value-arg form a no-transformer author would hand-write. It carries the third
  // `Gated` parameter and the same `Exclude<Slots, 'signatures'>` return as core's
  // value-arg overload, so the two combine as overloads on one face (arity — zero
  // value args with an explicit type arg vs a `...slots` rest — disambiguates).
  interface IWithSignatureBuilder<S extends string, Slots extends Slot, Gated extends boolean> {
    /**
     * Type-driven append — `withSignature<[IA, IB]>()` derives one overload's
     * slots from the tuple and appends it, lowering to
     * `withSignature("A-token", "B-token")`. Repeatable (it strikes only the bulk
     * `'signatures'` slot). Never runs post-transform.
     */
    withSignature<T extends readonly any[]>(): AddChain<S, Exclude<Slots, 'signatures'>, Gated>;
  }

  // The type-driven BULK form merges onto core's `IWithSignaturesBuilder` face —
  // the `signatures` slot. `withSignatures<T>()` derives the WHOLE signature set
  // from a tuple-of-tuples `T` and replaces in one call, lowering to
  // `withSignatures(...signaturesfor<T>())`. Same third `Gated` parameter and
  // `Exclude<Slots, 'signature' | 'signatures'>` return as core's value-arg
  // overload, so the two combine as overloads on one face.
  interface IWithSignaturesBuilder<S extends string, Slots extends Slot, Gated extends boolean> {
    /**
     * Type-driven bulk replace — `withSignatures<[[IA, IB], [IC]]>()` derives the
     * whole signature set from the tuple-of-tuples and replaces it, lowering to
     * `withSignatures(["A-token", "B-token"], ["C-token"])`. Once-only (it strikes
     * both signature slots). Never runs post-transform.
     */
    withSignatures<T extends ReadonlyArray<readonly any[]>>(): AddChain<S, Exclude<Slots, 'signature' | 'signatures'>,
      Gated>;
  }

  // The authored lifetime form merges onto core's `IAsBuilder` face — the `scope`
  // slot of the chain the registration forms return. It carries the third `Gated`
  // parameter so the merge matches core's face signature exactly.
  interface IAsBuilder<S extends string, Slots extends Slot, Gated extends boolean> {
    /**
     * The AUTHORED lifetime form — `.as<"singleton">()`. The scope name is a
     * TYPE argument; the `Scope extends S` bound is the compile-time
     * captive-misconfiguration guard. The transformer rewrites it to the
     * value-arg `.as("singleton")` before it runs, so it consumes the `scope`
     * slot exactly like the runtime form.
     */
    as<Scope extends S>(): AddChain<S, Exclude<Slots, 'scope'>, Gated>;
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
