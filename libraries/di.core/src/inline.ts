// Inline-sugar impl bodies for di.core — see the "rhombus.inline" key in this
// package's package.json.
//
// Authored, never executed: the generic inline transform stage substitutes these
// single-return-expression bodies at consumer call sites (this → the receiver,
// the type parameter bound from the checker), then the primitive stages lower
// the result. This file is DELIBERATELY not re-exported from the barrel: its
// body contains `nameof<T>()` over an unbound generic, and a barrel re-export
// would let di.core's own nameof lowering rewrite it inside di.core's dist and
// pollute the public d.ts. Keeping it out of the barrel sidesteps both without
// touching the frozen nameof stage.

import { nameof } from '@rhombus-std/primitives';
import type { ServiceQuery } from './provider.js';

/**
 * `isService<T>()` sugar body — the tokenless registration predicate. It is the
 * exact hand-written form a no-transformer consumer would author:
 * `this.isService(nameof<T>())`.
 */
export const ServiceQueryInline = {
  isService<T>(this: ServiceQuery): boolean {
    return this.isService(nameof<T>());
  },
};
