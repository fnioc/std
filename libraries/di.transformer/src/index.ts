// @rhombus-std/di.transformer — the type-only authoring surface + inline sugar
// bodies for the di registration forms.
//
// Build-time only, and no longer a TS-plugin transformer: the lowering runs on the
// Go/ttsc engine, wired through the `./ttsc` descriptor. What survives here is the
// authoring contract, not an emit implementation:
//
//   - `./augment.ts` — the `declare module '@rhombus-std/di.core'` that lights up
//     the token-free authoring forms (`add<I>(C)`, `.as<"x">()`, `resolve<T>()`, …)
//     only when this package is in a consumer's tsconfig `types`.
//   - `./inline.ts` — the single-expression sugar bodies the inline stage
//     side-parses from src and substitutes at call sites (never bundled: this
//     barrel deliberately does not re-export it).
//   - `./signatureof.ts` — the authoring-time dependency-signature primitive the
//     inline bodies call; its runtime body throws so un-transformed code fails loud.
//
// A single import of `@rhombus-std/di.transformer` (or listing it in `types`)
// brings the authoring augmentation into scope.
import './augment.js';

// Re-export the authoring brand types so a consumer can use `Inject<T, "tok">`,
// the open-generics placeholders (`Hole<N, C>`, `$<N>`), `Typeof<T>`, and the
// overload-faithful `OverloadedParameters` / `OverloadedConstructorParameters`
// without importing from `@rhombus-std/di.core` directly.
export type { $, Hole, Inject, OverloadedConstructorParameters, OverloadedParameters, Typeof } from './augment.js';
