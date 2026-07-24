// @rhombus-std/config.transformer — the config authoring surface for the
// `.withType<T>()` schema sugar.
//
// Build-time only, and not a TS-plugin transformer: the lowering runs on the
// Go/ttsc engine, wired through the `./ttsc` descriptor. What lives here is the
// authoring contract, not an emit implementation:
//
//   - `./schemaof.ts` — the authoring-time `schemaof<T>()` config-schema primitive
//     the inline body calls; its runtime body throws so un-transformed code fails
//     loud.
//   - `./inline.ts` — the single-expression `withType<T>()` sugar body the inline
//     stage side-parses from src and substitutes at call sites (never bundled: this
//     barrel deliberately does not re-export it).
//
// The `withType<U>()` declare-module augmentation itself lives in
// `@rhombus-std/config` (`with-type-augment.ts`) — the same specifier the config
// stage matches — so no augmentation is re-declared here.
export {};
