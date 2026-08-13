// Type-only augmentation contributed to `@rhombus-std/di.core`: adds the
// 0-arg `addOptions<T>()` overload to `Manifest`, alongside the
// explicit `addOptions(optionsType, tType)` overloads from
// `@rhombus-std/options.augmentations`. `Scopes` defaults to `any` so the
// merge applies uniformly across every `Manifest<Scopes>` instantiation.
//
// Imported for its side effect from ./index.ts so a consumer referencing
// this package pulls the augmentation into its program.

// A named import (not a member reference inside the augmentation block) because
// unqualified names in a `declare module` body resolve in THIS file's scope.
import type { Manifest } from '@rhombus-std/di.core';

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string = any> {
    /**
     * Registers an `IOptions<T>` wrapping the resolved `T`. Returns a NEW
     * manifest carrying the registration, still open at the `scope` and `key`
     * slots — the result must be kept.
     */
    addOptions<T>(): Manifest<Scopes>;
  }
}
