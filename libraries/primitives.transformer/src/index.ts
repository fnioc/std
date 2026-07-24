// @rhombus-std/primitives.transformer — the standalone token-derivation authoring
// transformer.
//
// Its primary role is the Go/ttsc descriptor package (the single `./ttsc`
// subpath) that spawns the shared owner binary. The host runs its whole
// always-on stage table (W7 — no stage selection); depending on this package is
// what makes ttsc spawn it. This barrel adds the AUTHORING-ONLY token-grammar
// predicate primitives the resolve-family sugar bodies compose —
// `isSingular<T>()` and `singularValue<T>()` (§94) — shipped as throwing stubs
// like `tokenfor`: the transformer lowers each call, and the runtime body only
// runs (and throws) when the transformer is absent. They live here, not in the
// runtime `@rhombus-std/primitives` leaf, because they are never called from
// runtime source (§92's homing rule).

export { IS_FACTORY_NAME, isFactory } from './isFactory.js';
export { IS_SINGULAR_NAME, isSingular } from './isSingular.js';
export { PARAM_TOKENSFOR_NAME, paramtokensfor } from './paramtokensfor.js';
export { RETURN_TOKENFOR_NAME, returntokenfor } from './returntokenfor.js';
export { SINGULAR_VALUE_NAME, singularValue } from './singularValue.js';
