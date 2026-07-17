// @rhombus-std/di.transformer.options — the options-sugar ts-patch transformer.
//
// Build-time only. A `@rhombus-std/di.transformer` SATELLITE (not a standalone
// family transformer — see docs/decisions.md §15): it lowers the type-driven
// `addOptions<T>()` sugar to the explicit verb
// `addOptions(token(IOptions<T>), token(T))` that `@rhombus-std/options.augmentations`
// installs. Pure token-lowering (di's kind of transform: type → token); it emits
// di registrations and has zero value without di, so it lives as a di.transformer
// satellite that IMPORTS di.transformer's token derivation — never the di runtime.
//
// Consumer tsconfig plugin form (ALONGSIDE di.transformer, order-independent):
//
// ```jsonc
// { "compilerOptions": { "plugins": [
//   { "transform": "@rhombus-std/di.transformer", "import": "transform" },
//   { "transform": "@rhombus-std/di.transformer.options", "import": "transform" }
// ] } }
// ```

// The type-only authoring surface this transformer contributes to
// `@rhombus-std/di.core` (`addOptions<T>()`). Side-effect import: it carries a
// `declare module "@rhombus-std/di.core"` augmentation that must enter the program
// of any consumer that references this package's types.
import './augment.js';

// ts-patch entry point (default + named `transform`) and the test-drivable factory.
export { createTransformerFactory, default as transformer, transform } from './transformer.js';

// Diagnostic surface — exported so downstream tooling (and tests) can assert on
// the stable code without matching message text.
export { type Diagnostic, DiagnosticCode, type IDiagnosticSink } from './diagnostics.js';
