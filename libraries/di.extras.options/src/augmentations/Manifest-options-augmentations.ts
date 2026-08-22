// @rhombus-std/di.extras.options — the authoring surface for the
// `addOptions<T>()` sugar: the declare-module that types it onto `Manifest`,
// and the marker body the inline stage substitutes at each call site.
//
// A consumer listing this package in its tsconfig `types` gets the overload;
// the body below never runs, so nothing here is reachable at runtime.

// Type-only: puts the sugar's declare-module faces in every program that
// compiles this source, with no runtime import of the authoring package.
import type {} from '@rhombus-std/options.augmentations';
import type { Manifest } from '@rhombus-std/di.core';
import { registerInlineBodies, typefor } from '@rhombus-std/primitives.extras';

// A named import (not a member reference inside the augmentation block) because
// unqualified names in a `declare module` body resolve in THIS file's scope.
declare module '@rhombus-std/di.core' {
  interface Manifest<Lifetime> {
    /**
     * Offers `IOptions<T>`, taking its base value from whatever `T` itself
     * resolves to. Returns a NEW manifest carrying the registration — the
     * result must be kept.
     */
    addOptions<T>(): Manifest<Lifetime>;
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
  addOptions<T>(this: Manifest<unknown>): Manifest<unknown> {
    return this.addOptions(typefor<T>());
  },
};
registerInlineBodies<Manifest<unknown>>(ServiceOptionsInline);
