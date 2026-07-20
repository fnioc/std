// Inline-sugar impl bodies for the di registration surface — see the
// "rhombus.inline" key in this package's package.json.
//
// Authored, never executed: the generic inline transform stage substitutes these
// single-return-expression bodies at consumer call sites (this → the receiver,
// the type parameter bound from the checker), then the primitive stages lower
// the result. The bodies contain `nameof<T>()` (and `signatureof(...)` / `keyof<T>()`)
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
// `@rhombus-std/primitives` leaf; `nameof` stays in that leaf, since runtime source
// imports it directly.

import type { AddBuilder, Ctor, Factory, IServiceManifestBase, IServiceQuery } from '@rhombus-std/di.core';
import { nameof } from '@rhombus-std/primitives';
import { keyof } from './keyof.js';
import { signatureof } from './signatureof.js';

/**
 * `isService<T>()` sugar body — the tokenless registration predicate. It is the
 * exact hand-written form a no-transformer consumer would author:
 * `this.isService(nameof<T>())`.
 */
export const ServiceQueryInline = {
  isService<T>(this: IServiceQuery): boolean {
    return this.isService(nameof<T>());
  },
};

/**
 * The type-driven registration sugar bodies — the `add<T>(ctor)`,
 * `addFactory<T>(fn)`, and `addValue<I>(value)` forms. Each is the EXACT
 * hand-written form a no-transformer consumer would author:
 *
 *   add<T>(ctor)        → this.add(nameof<T>(), ctor, signatureof(ctor), keyof<T>())
 *   addFactory<T>(fn)   → this.addFactory(nameof<T>(), fn, signatureof(fn), keyof<T>())
 *   addValue<I>(value)  → this.addValue(nameof<I>(), value, keyof<I>())
 *
 * `nameof<T>()` derives the service token (the BASE token for a `Keyed<T, K>`);
 * `signatureof(...)` derives the positional dependency signatures the third
 * argument carries — exactly the `[[...]]` array the di registration stage
 * synthesizes for the same value; and `keyof<T>()` derives a keyed registration's
 * KEY, which di.core composes onto the base as `base#key`. For an UNKEYED type the
 * keyof lowers to `undefined` and the transformer ELIDES the trailing argument, so
 * the emitted call is byte-identical to the pre-key 3-argument form and matches the
 * di stage's direct lowering. `addValue` carries no deps, so its body composes
 * `nameof` + `keyof` — no `signatureof`.
 *
 * These forms cover the Wave-1+2 scope: a class constructor (`add<T>(ctor)`), a
 * factory function (`addFactory<T>(fn)`), and an already-built value
 * (`addValue<I>(value)`). The remaining type-driven forms (`add<I>(factory)`
 * overload-by-arg-inspection, `add<I>(ctor, overrides)`, open-template
 * instantiation expressions, `.as<"scope">()`, and the tokenless resolve
 * family) stay on the di registration stage.
 *
 * The value parameter names (`ctor` / `factory` / `value`) are LOAD-BEARING:
 * the inline stage discriminates a sugar overload from a runtime one
 * structurally, by type-parameter count and value-parameter NAMES, so each
 * body's parameter name must equal the declared overload's (`ctor` /
 * `factory` / `value`) it is claimed against.
 */
export const ServiceManifestInline = {
  add<T>(this: IServiceManifestBase, ctor: Ctor): AddBuilder<'singleton'> {
    return this.add(nameof<T>(), ctor, signatureof(ctor), keyof<T>());
  },
  addFactory<T>(this: IServiceManifestBase, factory: Factory): AddBuilder<'singleton'> {
    return this.addFactory(nameof<T>(), factory, signatureof(factory), keyof<T>());
  },
  addValue<I>(this: IServiceManifestBase, value: unknown): void {
    return this.addValue(nameof<I>(), value, keyof<I>());
  },
};
