// Sugar bodies for di's registration and resolve surfaces — the object literals
// below are substitution source only: this package's barrel (`./index.ts`) does
// not re-export this file, so it never reaches `dist`. Each body shows the exact
// expression the matching overload in `./augment.ts` becomes.
//
// Each object literal is paired with a `registerInlineBodies(...)` call — a
// no-op marker, not dead code.

import type { Ctor, DepSignatures, DepSlot, Factory, IServiceManifest, IServiceQuery,
  Token } from '@rhombus-std/di.core';
import { overrideSignatures, signaturefor, signaturesfor } from '@rhombus-std/di.core';
import { registerInlineBodies, tokenfor, tokenof } from '@rhombus-std/primitives.extras';
import { isFactory, isSingular, paramtokensfor, returntokenfor, singularValue } from '@rhombus-std/primitives.extras';
import { keyedtokenfor } from './keyedtokenfor.js';
import { keyof } from './keyof.js';
import { signatureof } from './signatureof.js';
import { valueof } from './valueof.js';

/** `this` typing for the addClass/addFactory/addValue bodies below. */
interface IInlineRegistrationTarget {
  addClass(token: Token, ctor: Ctor, signatures: DepSignatures, scope?: undefined,
    key?: string | undefined): IServiceManifest;
  addFactory(token: Token, factory: Factory, signatures: DepSignatures, scope?: undefined,
    key?: string | undefined): IServiceManifest;
  addValue(token: Token, value: unknown, key?: string | undefined): IServiceManifest;
}

/**
 * `isService<T>()` → `this.isService(keyedtokenfor<T>())` — `isService` takes a
 * single already-composed token, so a keyed query composes `base#key` up front
 * rather than passing the base and key separately.
 */
export const ServiceQueryInline = { isService<T>(this: IServiceQuery): boolean {
  return this.isService(keyedtokenfor<T>());
} };
registerInlineBodies(ServiceQueryInline);

/** `this` typing for the resolve-family bodies below. */
interface IInlineResolveTarget {
  resolve(token: Token, key?: string): any;
  resolveAsync(token: Token): any;
  tryResolve(token: Token, key?: string): any;
  resolveFactory(type: Token, params?: readonly Token[]): any;
}

/**
 * The tokenless resolve-family bodies:
 *
 *   resolve<T>()      → isSingular<T>() ? singularValue<T>() : this.resolve(tokenfor<T>(), keyof<T>())
 *   resolveAsync<T>() → isSingular<T>() ? singularValue<T>() : this.resolveAsync(keyedtokenfor<T>())
 *   tryResolve<T>()   → isSingular<T>() ? singularValue<T>() : this.tryResolve(tokenfor<T>(), keyof<T>())
 *
 * `resolve`/`tryResolve` take a base token plus an optional key; `resolveAsync`
 * takes no key, so a keyed `resolveAsync<Keyed<T, K>>()` must arrive pre-composed
 * via `keyedtokenfor`.
 *
 * A singular `T` (a literal, `null`, `undefined`, `void`) short-circuits to its
 * own value via `isSingular`/`singularValue` instead of a resolve call. A
 * function type `F` resolves as a factory: `resolve<F>()` / `resolveAsync<F>()`
 * become `this.resolveFactory(returntokenfor<F>(), paramtokensfor<F>())` — the
 * factory's return-type token plus its parameter tokens. `tryResolve` has no
 * factory form.
 */
export const ResolverInline = { resolve<T>(this: IInlineResolveTarget): T {
  return isSingular<T>()
    ? singularValue<T>()
    : isFactory<T>()
    ? this.resolveFactory(returntokenfor<T>(), paramtokensfor<T>())
    : this.resolve(tokenfor<T>(), keyof<T>());
}, resolveAsync<T>(this: IInlineResolveTarget): Promise<T> | T {
  return isSingular<T>()
    ? singularValue<T>()
    : isFactory<T>()
    ? this.resolveFactory(returntokenfor<T>(), paramtokensfor<T>())
    : this.resolveAsync(keyedtokenfor<T>());
}, tryResolve<T>(this: IInlineResolveTarget): T | undefined {
  return isSingular<T>() ? singularValue<T>() : this.tryResolve(tokenfor<T>(), keyof<T>());
} };
registerInlineBodies(ResolverInline);

/**
 * The type-driven registration bodies:
 *
 *   addClass<T>(ctor)   → this.addClass(tokenfor<T>(), ctor, signatureof(ctor), void 0, keyof<T>())
 *   addFactory<T>(fn)   → this.addFactory(tokenfor<T>(), fn, signatureof(fn), void 0, keyof<T>())
 *   addValue<I>(value)  → this.addValue(tokenfor<I>(), value, keyof<I>())
 *
 * The `void 0` fills the scope slot the trailing key sits behind — a sugar body
 * has no lifetime to pass; that's chosen later via `.as(...)`.
 *
 * Keep the `ctor` / `factory` / `value` parameter names exactly as written: each
 * overload is matched by its type-parameter count and value-parameter name.
 */
export const ServiceManifestInline = { addClass<T>(this: IInlineRegistrationTarget, ctor: Ctor): IServiceManifest {
  return this.addClass(tokenfor<T>(), ctor, signatureof(ctor), void 0, keyof<T>());
}, addFactory<T>(this: IInlineRegistrationTarget, factory: Factory): IServiceManifest {
  return this.addFactory(tokenfor<T>(), factory, signatureof(factory), void 0, keyof<T>());
}, addValue<I>(this: IInlineRegistrationTarget, value: unknown): IServiceManifest {
  return this.addValue(tokenfor<I>(), value, keyof<I>());
} };
registerInlineBodies(ServiceManifestInline);

/**
 * `addClass<I>(ctor, overrides)` → `this.addClass(tokenfor<I>(), ctor,
 * overrideSignatures(signatureof(ctor), overrides), void 0, keyof<I>())` — the
 * registration-time override form for a constructor you can't annotate directly.
 *
 * A separate object literal from {@link ServiceManifestInline} because an object
 * literal can't carry two `addClass` members; matched by its second parameter
 * being named `overrides`.
 */
export const ServiceManifestOverrideInline = {
  addClass<I>(this: IInlineRegistrationTarget, ctor: Ctor,
    overrides: ReadonlyArray<string | undefined>): IServiceManifest {
    return this.addClass(tokenfor<I>(), ctor, overrideSignatures(signatureof(ctor), overrides), void 0, keyof<I>());
  },
};
registerInlineBodies(ServiceManifestOverrideInline);

/**
 * The no-type-arg self-registration bodies — the token is derived from the
 * VALUE rather than a type argument:
 *
 *   addClass(ctor)   → this.addClass(tokenfor(ctor), ctor, signatureof(ctor))
 *   addFactory(fn)   → this.addFactory(tokenfor(fn), fn, signatureof(fn))
 *   addValue(value)  → this.addValue(tokenof(value), value)
 *
 * `addClass`/`addFactory` derive from what the value PRODUCES (a class's
 * instance, a factory's return type); `addValue` derives from the value's OWN
 * type via `tokenof`, since a function stored as a value should tokenize as
 * that function, not its return type.
 *
 * A separate object literal from {@link ServiceManifestInline}: these bodies
 * carry zero type parameters, which is how they're told apart despite sharing
 * member and parameter names.
 */
export const ServiceManifestSelfInline = { addClass(this: IInlineRegistrationTarget, ctor: Ctor): IServiceManifest {
  return this.addClass(tokenfor(ctor), ctor, signatureof(ctor));
}, addFactory(this: IInlineRegistrationTarget, factory: Factory): IServiceManifest {
  return this.addFactory(tokenfor(factory), factory, signatureof(factory));
}, addValue(this: IInlineRegistrationTarget, value: unknown): IServiceManifest {
  return this.addValue(tokenof(value), value);
} };
registerInlineBodies(ServiceManifestSelfInline);

/** `this` typing for the chain-continuation bodies below. */
interface IInlineChainTarget {
  withSignature(...slots: readonly DepSlot[]): IServiceManifest;
  withSignatures(...signatures: ReadonlyArray<readonly DepSlot[]>): IServiceManifest;
  as(scope: string): IServiceManifest;
}

/**
 * The type-driven chain-continuation bodies:
 *
 *   withSignature<T>()  → this.withSignature(...signaturefor<T>())
 *   withSignatures<T>() → this.withSignatures(...signaturesfor<T>())
 *   as<Scope>()         → this.as(valueof<Scope>())
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
registerInlineBodies(ManifestChainInline);
