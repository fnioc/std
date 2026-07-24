// @rhombus-std/primitives.transformer — the standalone token-derivation authoring
// transformer.
//
// Its primary role is the Go/ttsc descriptor package (the `./ttsc` +
// `./*-ttsc` subpaths) that spawns the shared owner binary's inline / nameof /
// signatureof / keyof / mergesynth stages. This barrel adds the AUTHORING-ONLY
// token-grammar predicate primitives the resolve-family sugar bodies compose —
// `isSingular<T>()` and `singularValue<T>()` (§94) — shipped as throwing stubs
// like `tokenfor`: the transformer lowers each call, and the runtime body only
// runs (and throws) when the transformer is absent. They live here, not in the
// runtime `@rhombus-std/primitives` leaf, because they are never called from
// runtime source (§92's homing rule).

export { IS_SINGULAR_NAME, isSingular } from './isSingular.js';
export { SINGULAR_VALUE_NAME, singularValue } from './singularValue.js';
