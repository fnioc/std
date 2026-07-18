// Inline-sugar impl bodies for di.core — see the "rhombus.inline" key in this
// package's package.json.
//
// Authored, never executed: the generic inline transform stage substitutes these
// single-return-expression bodies at consumer call sites (this → the receiver,
// the type parameter bound from the checker), then the primitive stages lower
// the result. Its bodies contain `nameof<T>()` (and `signatureof(...)`) over an
// UNBOUND generic, so di.core's own primitive lowering — which has no type to
// bind here — would rewrite them to the empty token `this.isService("")` and an
// empty signature array. Two paths must be kept clear of that lowering:
//   - the BUNDLED dist (`bun build` from the barrel): this file is DELIBERATELY
//     not re-exported from the barrel, so the bundle never pulls it in and the
//     public d.ts stays clean; and
//   - the PER-FILE internal emit (`tspc -p tsconfig.build.json` → dist/internal/):
//     the barrel omission does NOT cover this, since that program is driven by
//     `include`, not the barrel — so tsconfig.build.json EXCLUDES this file
//     explicitly. A white-box import through internal/* then fails module-not-found
//     rather than resolving the empty-token lowering.
// Both sidestep the frozen nameof stage without touching it.

import { nameof, signatureof } from '@rhombus-std/primitives';
import type { Ctor } from '@rhombus-toolkit/func';
import type { AddBuilder, IServiceManifestBase } from './authoring.js';
import type { IServiceQuery } from './provider.js';
import type { Factory } from './registrations.js';

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
 *   add<T>(ctor)        → this.add(nameof<T>(), ctor, signatureof(ctor))
 *   addFactory<T>(fn)   → this.addFactory(nameof<T>(), fn, signatureof(fn))
 *   addValue<I>(value)  → this.addValue(nameof<I>(), value)
 *
 * `nameof<T>()` derives the service token; `signatureof(...)` derives the
 * positional dependency signatures the third argument carries — exactly the
 * `[[...]]` array the di registration stage synthesizes for the same value, so
 * the inline (nameof + signatureof) lowering and the di stage's direct lowering
 * emit byte-identical output. `addValue` carries no deps, so its body composes
 * `nameof` alone — no `signatureof`.
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
    return this.add(nameof<T>(), ctor, signatureof(ctor));
  },
  addFactory<T>(this: IServiceManifestBase, factory: Factory): AddBuilder<'singleton'> {
    return this.addFactory(nameof<T>(), factory, signatureof(factory));
  },
  addValue<I>(this: IServiceManifestBase, value: unknown): void {
    return this.addValue(nameof<I>(), value);
  },
};
