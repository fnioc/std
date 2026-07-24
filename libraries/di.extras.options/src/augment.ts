// Type-only authoring surface contributed to `@rhombus-std/di.core` by this
// satellite: the type-driven `addOptions<T>()` sugar.
//
// Like every `@rhombus-std/di.extras` authored form, `addOptions<T>()` NEVER
// executes — the transformer rewrites it to the explicit verb
// `addOptions(token(IOptions<T>), token(T))` before runtime. It is therefore a
// PURE TYPING, living here (not in `@rhombus-std/options.augmentations`'s runtime
// surface) so it lights up only when this transformer is in the TypeScript
// program. Without the transformer the 0-arg form does not exist — which is the
// truth at runtime, killing the "compiles but throws" footgun.
//
// It DECLARATION-MERGES a new overload onto `IServiceManifestBase` (the interface
// the public `ServiceManifest` resolves to), composing with the explicit
// `addOptions(token, tToken)` / `addOptions(token, makeBase)` overloads that
// `@rhombus-std/options.augmentations` contributes. `Provider` is defaulted so the
// merge matches core's type-parameter list.
//
// This module must be reachable from the published types entry (it is `import`ed
// for its side effect from `./index.ts`) so a consumer referencing
// `@rhombus-std/di.extras.options` pulls the augmentation into its program.

// A named import (not a member reference inside the augmentation block) because
// unqualified names in a `declare module` body resolve in THIS file's scope.
import type { AddChain } from '@rhombus-std/di.core';

declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
    /**
     * Type-driven options sugar — registers an `IOptions<T>` at `token(IOptions<T>)`
     * that wraps the `T` resolved from `token(T)`. Lowers to the explicit
     * `addOptions(token(IOptions<T>), token(T))` (`@rhombus-std/options.augmentations`).
     * Never runs post-transform. Returns the same chain the explicit
     * `addOptions` overloads hand back — a NEW manifest carrying the
     * registration, still open at the `scope` and `key` slots — so the lifetime
     * is chosen at the registration site and the result must be KEPT.
     */
    addOptions<T>(): AddChain<Scopes, 'scope' | 'key', false>;
  }
}
