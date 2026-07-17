// Inline-sugar impl bodies for di.core — see the "rhombus.inline" key in this
// package's package.json.
//
// Authored, never executed: the generic inline transform stage substitutes these
// single-return-expression bodies at consumer call sites (this → the receiver,
// the type parameter bound from the checker), then the primitive stages lower
// the result. Its body contains `nameof<T>()` over an UNBOUND generic, so
// di.core's own nameof lowering — which has no type to bind here — would rewrite
// it to the empty token `this.isService("")`. Two paths must be kept clear of
// that lowering:
//   - the BUNDLED dist (`bun build` from the barrel): this file is DELIBERATELY
//     not re-exported from the barrel, so the bundle never pulls it in and the
//     public d.ts stays clean; and
//   - the PER-FILE internal emit (`tspc -p tsconfig.build.json` → dist/internal/):
//     the barrel omission does NOT cover this, since that program is driven by
//     `include`, not the barrel — so tsconfig.build.json EXCLUDES this file
//     explicitly. A white-box import through internal/* then fails module-not-found
//     rather than resolving the empty-token lowering.
// Both sidestep the frozen nameof stage without touching it.

import { nameof } from '@rhombus-std/primitives';
import type { IServiceQuery } from './provider.js';

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
