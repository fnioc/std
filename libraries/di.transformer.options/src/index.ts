// @rhombus-std/di.transformer.options — the type-only authoring surface for the
// `addOptions<T>()` sugar (a di.transformer satellite).
//
// Build-time only, and no longer a ts-patch transformer: the lowering runs on the
// Go/ttsc engine, wired through the `./ttsc` descriptor. This barrel pulls the
// `declare module '@rhombus-std/di.core'` `addOptions<T>()` augmentation into the
// program of any consumer that lists this package in its tsconfig `types`, so the
// 0-arg sugar form lights up only when the transformer is present.
import './augment.js';
