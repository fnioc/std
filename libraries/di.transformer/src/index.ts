// @rhombus-std/di.transformer — the ioc ts-patch compiler transformer.
//
// Build-time only. It provides token generation, dependency
// extraction via the TypeChecker, inline signature emission (the derived
// signature rides as the `add`/`addFactory` call's third argument), registration
// lowering (`add<I>(C).as<"x">()` → string-token form), `nameof<T>()` rewriting,
// and the edge-case behaviour (dynamic-class no-emission).
//
// It also performs factory detection (`() => IFoo` ctor params become
// `{ type: "<token>" }` slots) and emits the factory-signature and
// token-derivation diagnostics (see `deps.ts` + `checks.ts`).

// The type-only authoring surface this transformer contributes to `@rhombus-std/di`
// (`add<I>(C)`, `.as<"x">()`, `resolve<T>()`, …). Side-effect import: it carries
// a `declare module "@rhombus-std/di"` augmentation that must enter the program of any
// consumer that references `@rhombus-std/di.transformer`'s types.
import "./augment.js";

// The overload-faithful parameter-tuple utilities, re-exported so a consumer can
// type a factory's rest parameter (`(...args: OverloadedConstructorParameters<
// typeof C>) => I`) without importing `@rhombus-std/di.core` directly — an example app
// depends on `@rhombus-std/di.transformer` for the plugin already, so this is the same
// "one import reaches the whole authoring surface" gateway `augment.ts` itself
// documents. Re-exported from `./augment.js` (not `@rhombus-std/di.core` directly) so
// there is exactly one place that names the upstream package.
export type { OverloadedConstructorParameters, OverloadedParameters } from "./augment.js";

// ts-patch entry point (default + named `transform`) and the test-drivable
// factory.
export { createTransformerFactory, default as transformer, transform } from "./transformer.js";

// `nameof<T>()` — the compile-time token mechanism (rewritten by the transformer).
export { nameof } from "./nameof.js";

// Token generation, dependency extraction, and diagnostics — exported so
// downstream tooling (and tests) can reuse the building blocks.
export { type CheckContext } from "./checks.js";
export {
  type ConstructorExtraction,
  type DepContext,
  extractFromExpression,
  extractInstantiatedSignature,
  extractSignatureFromClass,
  type FactorySlot,
  isFactorySlot,
  isScopeSlot,
  isTypeArgSlot,
  isUnionSlot,
  type ScopeSlot,
  type Signature,
  type Slot,
  slotsEqual,
  type TypeArgSlot,
  type UnionSlot,
} from "./deps.js";
export { type Diagnostic, DiagnosticCode, type DiagnosticSink, error, warning } from "./diagnostics.js";
export {
  type DeriveFailure,
  deriveToken,
  holeNumberFor,
  injectTokenFor,
  type TokenContext,
  tokenForType,
  type TokenResult,
} from "./tokens.js";
