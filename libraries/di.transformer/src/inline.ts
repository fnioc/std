// Inline-sugar impl bodies for the di registration surface — see the
// "rhombus.inline" key in this package's package.json.
//
// Authored, never executed: the generic inline transform stage substitutes these
// single-return-expression bodies at consumer call sites (this → the receiver,
// the type parameter bound from the checker), then the primitive stages lower
// the result. The bodies contain `tokenfor<T>()` (and `signatureof(...)` / `keyof<T>()`)
// over an UNBOUND generic, so they must never go through a per-file primitive lowering
// here — with no type to bind, that lowering would rewrite them to the empty
// token `this.isService("")` and an empty signature array.
//
// This package protects them for free: `@rhombus-std/di.transformer` bundles from
// its barrel (`src/index.ts`), which deliberately does NOT re-export this file, so
// `bun build` never pulls it into `dist`, and the package has no per-file
// emit at all. This file therefore exists purely as SUBSTITUTION SOURCE the inline
// stage side-parses out of `src/`; the typecheck gate still sees it (it stays in
// the program), but nothing lowers or ships it. `signatureof` (the authoring-time
// dependency-signature primitive) and `keyof` (the authoring-time
// keyed-registration-key primitive) live alongside these bodies here in
// di.transformer (`./signatureof.js`, `./keyof.js`), not in the runtime
// `@rhombus-std/primitives` leaf; `tokenfor` stays in that leaf, since runtime source
// imports it directly.

import type { Ctor, DepSignatures, DepSlot, Factory, IServiceManifest, IServiceQuery,
  Token } from '@rhombus-std/di.core';
import { overrideSignatures, signaturefor, signaturesfor } from '@rhombus-std/di.core';
import { tokenfor, tokenof } from '@rhombus-std/primitives.extras';
import { isFactory, isSingular, paramtokensfor, returntokenfor, singularValue } from '@rhombus-std/primitives.extras';
import { keyedtokenfor } from './keyedtokenfor.js';
import { keyof } from './keyof.js';
import { signatureof } from './signatureof.js';
import { valueof } from './valueof.js';

/**
 * The POSITIONAL-TAIL view of the three registration verbs the sugar bodies
 * lower against — the receiver type their `this` parameter carries.
 *
 * It exists because di.core's PUBLIC overloads cannot spell what a type-driven
 * sugar lowers to. Those overloads gate the slots: a `key` (argument 5) is only
 * reachable once a `scope` (argument 4) has been passed, and `key` is typed
 * `string`. A sugar body has NO scope to pass — the lifetime is chosen later via
 * `.as(...)` — and its key comes from `keyof<T>()`, which is
 * `string | undefined` because an unkeyed type has no key. So the body writes an
 * explicit `void 0` in the scope slot and a possibly-undefined key after it, and
 * the inline stage ELIDES both when the key lowers to `undefined` — leaving
 * exactly the plain 3-argument call a hand-writer would author.
 *
 * The runtime accepts precisely this shape (`ServiceManifestClass`'s
 * implementation signature takes `scope?` / `key?`); only the public overload
 * list, which is deliberately stricter for hand-writers, does not. This
 * interface is the transformer-side view of that same implementation, and never
 * appears in emitted output: the inline stage substitutes only the body's return
 * expression and drops the `this` parameter entirely.
 */
interface IInlineRegistrationTarget {
  addClass(
    token: Token,
    ctor: Ctor,
    signatures: DepSignatures,
    scope?: undefined,
    key?: string | undefined,
  ): IServiceManifest;
  addFactory(
    token: Token,
    factory: Factory,
    signatures: DepSignatures,
    scope?: undefined,
    key?: string | undefined,
  ): IServiceManifest;
  addValue(token: Token, value: unknown, key?: string | undefined): IServiceManifest;
}

/**
 * `isService<T>()` sugar body — the tokenless registration predicate. It is the
 * exact hand-written form a no-transformer consumer would author:
 * `this.isService(keyedtokenfor<T>())`.
 *
 * `isService` takes ONE token argument and no key parameter — being token-based it
 * "covers the keyed case in one method" (§98) by receiving the FULLY COMPOSED
 * `base#key` token a keyed service registers under. So the body derives with
 * `keyedtokenfor<T>()`, which composes that single `base#key` string for a
 * `Keyed<T, K>` query (`isService<Keyed<ICache, "redis">>()` →
 * `isService("caching.core:ICache#redis")`) — the exact token the keyed
 * registration lands on, so the probe actually round-trips. For an UNKEYED type
 * `keyedtokenfor` derives the plain base token identically to `tokenfor<T>()`, so
 * the unkeyed form stays byte-identical to the pre-key output.
 *
 * This DELIBERATELY changes the lowered output from the pre-§98 form (which used
 * `tokenof<T>()`, the raw alias-preserving `Keyed<...>` token) — that token never
 * matched any registration, so keyed `isService` always answered `false`. The old
 * form matched di.core's own `lowerIsServiceCall`, which has the same latent gap;
 * this body fixes both. (The split base + `keyof` token pair is for the
 * REGISTRATION bodies, where the runtime composes `base#key` from a tail key
 * argument; the query verbs take no key parameter, so they compose the whole token
 * up front via `keyedtokenfor`.)
 */
export const ServiceQueryInline = {
  isService<T>(this: IServiceQuery): boolean {
    return this.isService(keyedtokenfor<T>());
  },
};

/**
 * The POSITIONAL-TAIL view of the resolve-family verbs the resolve sugar bodies
 * lower against — the receiver type their `this` parameter carries. The verbs
 * return `any` (not the precise `T` / `Promise<T>` / `T | undefined` the public
 * overloads spell) purely so the body's `isSingular<T>() ? singularValue<T>() : …`
 * ternary type-checks: the SINGULAR true arm returns `T` (or the value, for an
 * async form's Rule-2 literal), so a precise `Promise<T>` receiver return would
 * fight the union. The inline stage substitutes only the body's return EXPRESSION
 * and drops the `this` parameter, so the receiver return type is immaterial to the
 * emitted output — it is byte-identical to di.core's own resolve lowering either way.
 */
interface IInlineResolveTarget {
  resolve(token: Token, key?: string): any;
  resolveAsync(token: Token): any;
  tryResolve(token: Token, key?: string): any;
  resolveFactory(type: Token, params?: readonly Token[]): any;
}

/**
 * The tokenless resolve-family sugar bodies — `resolve<T>()`, `resolveAsync<T>()`,
 * and `tryResolve<T>()`. Each is the EXACT form a no-transformer consumer would
 * hand-write, expressed through the `isSingular` / `singularValue` compile-time
 * predicate (§94):
 *
 *   resolve<T>()      → isSingular<T>() ? singularValue<T>() : this.resolve(tokenfor<T>(), keyof<T>())
 *   resolveAsync<T>() → isSingular<T>() ? singularValue<T>() : this.resolveAsync(keyedtokenfor<T>())
 *   tryResolve<T>()   → isSingular<T>() ? singularValue<T>() : this.tryResolve(tokenfor<T>(), keyof<T>())
 *
 * KEYED resolution composes through the SAME `keyof` split as registration (§98),
 * but each verb's shape follows what the runtime accepts:
 *
 *   - `resolve` / `tryResolve` carry a tail KEY parameter (`resolve(token, key?)`,
 *     defaulting `key = ""`), so the body passes the base token `tokenfor<T>()`
 *     plus `keyof<T>()`, and di.core composes `key === "" ? token : token + "#" +
 *     key` at runtime. An UNKEYED `keyof<T>()` lowers to `undefined`, which the
 *     inline stage ELIDES (trailing), so the unkeyed call is byte-identical to the
 *     plain `this.resolve("token")` form. A keyed `resolve<Keyed<ICache, "redis">>()`
 *     therefore lowers to `resolve("caching.core:ICache", "redis")`, which
 *     round-trips a keyed registration.
 *   - `resolveAsync` has NO key parameter (`resolveAsync(token)` only), so its keyed
 *     form must arrive already composed. The body derives the single composed
 *     `base#key` token with `keyedtokenfor<T>()` (which equals `tokenfor<T>()` for an
 *     unkeyed type, keeping the unkeyed output byte-identical).
 *
 * This DELIBERATELY changes the lowered output from the pre-§98 form (which used
 * `tokenof<T>()`, the raw alias-preserving `Keyed<...>` token) for KEYED types only:
 * that token never matched any registration, so a keyed resolve returned nothing /
 * threw. The old form matched di.core's own `lowerResolveCall`, which has the same
 * latent gap; these bodies fix both. Unkeyed output is unchanged.
 *
 * Type-directed dispatch lives INSIDE the body, never in the engine (§94): when `T`
 * is SINGULAR (a literal / null / undefined / void), `isSingular<T>()` lowers to
 * `true` and the engine constant-folds the ternary to `singularValue<T>()` — the
 * value itself, matching di.core's Rule-2 singular short-circuit. Otherwise
 * `isSingular<T>()` lowers to `false` and the ternary folds to the token form. Each
 * verb calls ITSELF with the derived token, so the method name is preserved
 * (`resolveAsync` stays `resolveAsync`).
 *
 * FACTORY form (§94, factory half): `resolve<F>()` / `resolveAsync<F>()` where `F`
 * is a function type lower to `resolveFactory(returnToken, [paramTokens])` — the
 * factory's RETURN-type token plus the array of its parameter tokens. The body
 * expresses this with a second compile-time predicate `isFactory<T>()` nested in
 * the non-singular arm: a function-typed `F` is not singular, so the outer ternary
 * takes the `isFactory<T>()` branch, which folds to
 * `this.resolveFactory(returntokenfor<T>(), paramtokensfor<T>())` — `returntokenfor`
 * derives the product token, `paramtokensfor` the `Inject`-brand aware parameter
 * tokens (elided as the trailing argument for a no-arg factory, matching di.core's
 * `resolveFactory(token)` form). A non-function `F` folds `isFactory<T>()` to
 * `false` and continues to the plain token resolve. `tryResolve` carries no public
 * factory overload, so it keeps the two-arm body.
 */
export const ResolverInline = {
  resolve<T>(this: IInlineResolveTarget): T {
    return isSingular<T>()
      ? singularValue<T>()
      : isFactory<T>()
      ? this.resolveFactory(returntokenfor<T>(), paramtokensfor<T>())
      : this.resolve(tokenfor<T>(), keyof<T>());
  },
  resolveAsync<T>(this: IInlineResolveTarget): Promise<T> | T {
    return isSingular<T>()
      ? singularValue<T>()
      : isFactory<T>()
      ? this.resolveFactory(returntokenfor<T>(), paramtokensfor<T>())
      : this.resolveAsync(keyedtokenfor<T>());
  },
  tryResolve<T>(this: IInlineResolveTarget): T | undefined {
    return isSingular<T>() ? singularValue<T>() : this.tryResolve(tokenfor<T>(), keyof<T>());
  },
};

/**
 * The type-driven registration sugar bodies — the `addClass<T>(ctor)`,
 * `addFactory<T>(fn)`, and `addValue<I>(value)` forms. Each is the EXACT
 * hand-written form a no-transformer consumer would author:
 *
 *   addClass<T>(ctor)   → this.addClass(tokenfor<T>(), ctor, signatureof(ctor), void 0, keyof<T>())
 *   addFactory<T>(fn)   → this.addFactory(tokenfor<T>(), fn, signatureof(fn), void 0, keyof<T>())
 *   addValue<I>(value)  → this.addValue(tokenfor<I>(), value, keyof<I>())
 *
 * `tokenfor<T>()` derives the service token (the BASE token for a `Keyed<T, K>`);
 * `signatureof(...)` derives the positional dependency signatures the third
 * argument carries — exactly the `[[...]]` array the di registration stage
 * synthesizes for the same value; and `keyof<T>()` derives a keyed registration's
 * KEY, which di.core composes onto the base as `base#key`. On `addClass` / `addFactory`
 * the key sits at argument 5, BEHIND the `scope` slot a sugar body has no value
 * for, so the body writes an explicit `void 0` placeholder there. For an UNKEYED
 * type the keyof lowers to `undefined` and the transformer ELIDES it AND the
 * placeholder it strands, so the emitted call is byte-identical to the plain
 * 3-argument form and matches the di stage's direct lowering. `addValue` carries
 * neither deps nor a lifetime, so its key is argument 3 and its body composes
 * `tokenfor` + `keyof` — no `signatureof`, no placeholder.
 *
 * Every verb now returns a NEW manifest (registration is immutable), so each body
 * RETURNS that manifest — a discarded result registers nothing.
 *
 * These forms cover the Wave-1+2 scope: a class constructor (`addClass<T>(ctor)`), a
 * factory function (`addFactory<T>(fn)`), and an already-built value
 * (`addValue<I>(value)`). The remaining type-driven forms (`addClass<I>(ctor, overrides)`,
 * open-template instantiation expressions, `.as<"scope">()`, and the tokenless
 * resolve family) stay on the di registration stage.
 *
 * The value parameter names (`ctor` / `factory` / `value`) are LOAD-BEARING:
 * the inline stage discriminates a sugar overload from a runtime one
 * structurally, by type-parameter count and value-parameter NAMES, so each
 * body's parameter name must equal the declared overload's (`ctor` /
 * `factory` / `value`) it is claimed against.
 */
export const ServiceManifestInline = {
  addClass<T>(this: IInlineRegistrationTarget, ctor: Ctor): IServiceManifest {
    return this.addClass(tokenfor<T>(), ctor, signatureof(ctor), void 0, keyof<T>());
  },
  addFactory<T>(this: IInlineRegistrationTarget, factory: Factory): IServiceManifest {
    return this.addFactory(tokenfor<T>(), factory, signatureof(factory), void 0, keyof<T>());
  },
  addValue<I>(this: IInlineRegistrationTarget, value: unknown): IServiceManifest {
    return this.addValue(tokenfor<I>(), value, keyof<I>());
  },
};

/**
 * The registration-time OVERRIDE sugar body — the `addClass<I>(ctor, overrides)`
 * form for a class whose constructor you cannot edit (third-party / generic). It
 * is the EXACT hand-written form a no-transformer consumer would author:
 *
 *   addClass<I>(ctor, overrides) → this.addClass(
 *     tokenfor<I>(), ctor, overrideSignatures(signatureof(ctor), overrides), void 0, keyof<I>())
 *
 * `signatureof(ctor)` derives the dependency signatures as usual, and
 * `overrideSignatures(...)` — a di.core RUNTIME helper (§99) — overlays the sparse
 * `overrides` array over each: a hole keeps the derived token, a string overrides
 * it, an explicit `undefined` clears it. The merge is at RUNTIME, so `overrides`
 * need not be a literal array — any expression producing it is legal, for
 * transformer and no-transformer callers alike (the no-transformer-first rule).
 *
 * `overrideSignatures` is a body-imported RUNTIME callee (not a compile-time
 * primitive): it SURVIVES lowering as an ordinary function call, and the inline
 * stage materializes its `@rhombus-std/di.core` import into the consumer file.
 *
 * This is a SEPARATE object-literal member from `ServiceManifestInline` because an
 * object literal cannot carry two `addClass` members; the inline stage
 * discriminates it from the one-argument `addClass<T>(ctor)` and from the
 * positional-scope `addClass<I>(ctor, scope)` by value-parameter NAMES — so this
 * body's second parameter MUST be named `overrides` to match the overload it is
 * claimed against (the positional-scope form, named `scope`, stays on di-direct).
 */
export const ServiceManifestOverrideInline = {
  addClass<I>(this: IInlineRegistrationTarget, ctor: Ctor,
    overrides: ReadonlyArray<string | undefined>): IServiceManifest
  {
    return this.addClass(tokenfor<I>(), ctor, overrideSignatures(signatureof(ctor), overrides), void 0, keyof<I>());
  },
};

/**
 * The no-type-arg SELF-registration sugar bodies — the `addClass(ctor)`,
 * `addFactory(fn)`, and `addValue(value)` forms, where the service token is
 * derived from the VALUE rather than an explicit `<I>` type argument. Each is the
 * EXACT hand-written form a no-transformer consumer would author:
 *
 *   addClass(ctor)   → this.addClass(tokenfor(ctor), ctor, signatureof(ctor))
 *   addFactory(fn)   → this.addFactory(tokenfor(fn), fn, signatureof(fn))
 *   addValue(value)  → this.addValue(tokenof(value), value)
 *
 * The token primitive DIFFERS per verb, matching the di registration engine's own
 * per-verb derivation (`inferredRegType`): `addClass` / `addFactory` derive from
 * the value's PRODUCED type via `tokenfor(value)` — a constructable value
 * tokenizes as the instance it builds, a callable value as what it returns — so
 * `addClass(SqlUserRepo)` registers `SqlUserRepo` under its own instance token
 * (self-registration). `addValue` instead uses `tokenof(value)`, the RAW-type
 * twin that never unwraps: an already-built value is registered under its OWN
 * type (a factory stored as a value tokenizes as the function, not its return
 * type), which is exactly what di.core's inferred `addValue` lowering keeps and
 * what its documented function-valued `addValue` support requires. Both match the
 * di-direct lowering byte-for-byte. `signatureof(...)` supplies the same
 * third-argument dependency array as the explicit forms (a value carries none, so
 * `addValue` omits it).
 *
 * A self-registration is UNKEYED and lifetime-unchosen by construction (a key
 * needs the `<Keyed<T, K>>` type argument these forms omit, and the lifetime is
 * chosen later via `.as(...)`), so the bodies write NO scope placeholder and NO
 * `keyof` — the lowered call is the plain 3-argument (`addClass` / `addFactory`)
 * or 2-argument (`addValue`) form directly, with nothing to elide.
 *
 * These are SEPARATE object-literal members from `ServiceManifestInline` because
 * the inline stage discriminates a sugar overload from a runtime one structurally,
 * by TYPE-PARAMETER COUNT and value-parameter names: the self forms carry ZERO
 * type parameters (count 0) where the generic forms carry one, so the two never
 * collide even though they share the member names and the `ctor` / `factory` /
 * `value` parameter names.
 */
export const ServiceManifestSelfInline = {
  addClass(this: IInlineRegistrationTarget, ctor: Ctor): IServiceManifest {
    return this.addClass(tokenfor(ctor), ctor, signatureof(ctor));
  },
  addFactory(this: IInlineRegistrationTarget, factory: Factory): IServiceManifest {
    return this.addFactory(tokenfor(factory), factory, signatureof(factory));
  },
  addValue(this: IInlineRegistrationTarget, value: unknown): IServiceManifest {
    return this.addValue(tokenof(value), value);
  },
};

/**
 * The POSITIONAL-TAIL view of the three chain-continuation modifiers the
 * fluent sugar bodies lower against — the receiver type their `this` parameter
 * carries. It is a loose structural stand-in for the `AddChain` builder faces
 * (`IWithSignatureBuilder` / `IWithSignaturesBuilder` / `IAsBuilder`): the inline
 * stage substitutes only the body's return EXPRESSION and drops the `this`
 * parameter, so the exact chain-narrowing types of the real faces are
 * immaterial here — the body only needs the value-arg verb it lowers to.
 */
interface IInlineChainTarget {
  withSignature(...slots: readonly DepSlot[]): IServiceManifest;
  withSignatures(...signatures: ReadonlyArray<readonly DepSlot[]>): IServiceManifest;
  as(scope: string): IServiceManifest;
}

/**
 * The type-driven chain-continuation sugar bodies — the `withSignature<T>()`,
 * `withSignatures<T>()`, and `.as<Scope>()` forms. Each is the EXACT
 * hand-written form a no-transformer consumer would author:
 *
 *   withSignature<T>()  → this.withSignature(...signaturefor<T>())
 *   withSignatures<T>() → this.withSignatures(...signaturesfor<T>())
 *   as<Scope>()         → this.as(valueof<Scope>())
 *
 * `signaturefor<T>()` mints ONE overload's dependency slots from the type tuple
 * `T` (spread in as the `withSignature` append args); `signaturesfor<T>()` mints
 * the whole overload set from a tuple-of-tuples (spread in as the `withSignatures`
 * bulk args); `valueof<Scope>()` mints the scope literal's VALUE the `as` verb
 * takes. Each body lowers INDEPENDENTLY to exactly what a hand author would write
 * — `add(t, c, [[…]]).withSignature('a')` is a hand-writable continuation — so a
 * `.withSignature<T>()` survives lowering as its own value-arg call rather than
 * folding into the registration's third argument (the survive-not-fold parity
 * decision).
 *
 * `signaturefor` / `signaturesfor` are di.core primitives (they produce di.core's
 * `DepSlot` shape and are called from runtime source too), imported from the
 * peered `@rhombus-std/di.core`; `valueof` is the authoring-only literal-value
 * primitive homed here in di.transformer (`./valueof.js`), sibling to
 * `signatureof` / `keyof`.
 */
export const ManifestChainInline = {
  withSignature<T extends readonly any[]>(this: IInlineChainTarget): IServiceManifest {
    return this.withSignature(...signaturefor<T>());
  },
  withSignatures<T extends ReadonlyArray<readonly any[]>>(this: IInlineChainTarget): IServiceManifest {
    return this.withSignatures(...signaturesfor<T>());
  },
  as<Scope extends string>(this: IInlineChainTarget): IServiceManifest {
    return this.as(valueof<Scope>());
  },
};
