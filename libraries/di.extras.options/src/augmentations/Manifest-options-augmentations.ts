// @rhombus-std/di.extras.options — the authoring surface for the
// `addOptions<T>()` sugar: the declare-module that types it onto `Manifest`,
// and the marker body the inline stage substitutes at each call site.
//
// A consumer listing this package in its tsconfig `types` gets the overload;
// the body below never runs, so nothing here is reachable at runtime.

import type { Manifest } from '@rhombus-std/di.core';
import type { Type } from '@rhombus-std/primitives';
import { registerInlineBodies, typefor } from '@rhombus-std/primitives.extras';

// A named import (not a member reference inside the augmentation block) because
// unqualified names in a `declare module` body resolve in THIS file's scope.
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string> {
    /**
     * Offers `IOptions<T>`, taking its base value from whatever `T` itself
     * resolves to. Returns a NEW manifest carrying the registration — the
     * result must be kept.
     */
    addOptions<T>(): Manifest<Scopes>;
  }
}

/**
 * `addOptions<T>()` sugar: `this.addOptions(typefor<T>())`.
 *
 * @remarks
 * The verb takes the bare `T`. `IOptions<T>` is never spelled here, because one
 * open registration answers every `IOptions<…>` request — so the sugar has only
 * its own type argument to derive.
 */
export const ServiceOptionsInline = {
  addOptions<T>(this: Manifest<any>): Manifest<any> {
    return this.addOptions(typefor<T>());
  },
};
registerInlineBodies<Manifest<any>>(ServiceOptionsInline);
