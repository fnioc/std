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
import { signaturefor, signaturesfor } from '@rhombus-std/di.core';
import { tokenfor } from '@rhombus-std/primitives';
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
    scope: undefined,
    key: string | undefined,
  ): IServiceManifest;
  addFactory(
    token: Token,
    factory: Factory,
    signatures: DepSignatures,
    scope: undefined,
    key: string | undefined,
  ): IServiceManifest;
  addValue(token: Token, value: unknown, key: string | undefined): IServiceManifest;
}

/**
 * `isService<T>()` sugar body — the tokenless registration predicate. It is the
 * exact hand-written form a no-transformer consumer would author:
 * `this.isService(tokenfor<T>())`.
 */
export const ServiceQueryInline = {
  isService<T>(this: IServiceQuery): boolean {
    return this.isService(tokenfor<T>());
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
