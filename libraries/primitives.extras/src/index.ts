// @rhombus-std/primitives.extras — the standalone token-derivation authoring
// transformer, and the home of every authoring-time token-grammar primitive.
//
// Its primary role is the Go/ttsc descriptor package (the single `./ttsc`
// subpath) that spawns the shared owner binary. The host runs its whole
// always-on stage table (W7 — no stage selection); depending on this package is
// what makes ttsc spawn it. This barrel ships the AUTHORING-ONLY token primitives
// as throwing stubs the transformer lowers at each call site (the runtime body
// only runs — and throws — when the transformer is absent): the token-derivation
// pair `tokenfor` / `tokenof`, and the resolve-family compile-time predicates the
// sugar bodies compose (`isSingular` / `singularValue` / `isFactory` /
// `returntokenfor` / `paramtokensfor`, §94). Every call is elided from the shipped
// output after lowering, so a consumer deps this package build-time only (§92's
// homing rule — constraint 11: these are all pure transformables, moved out of
// the runtime `@rhombus-std/primitives` leaf).

export { IS_FACTORY_NAME, isFactory } from './isFactory.js';
export { IS_SINGULAR_NAME, isSingular } from './isSingular.js';
export { PARAM_TOKENSFOR_NAME, paramtokensfor } from './paramtokensfor.js';
export { RETURN_TOKENFOR_NAME, returntokenfor } from './returntokenfor.js';
export { SINGULAR_VALUE_NAME, singularValue } from './singularValue.js';
export { tokenfor, TOKENFOR_NAME } from './tokenfor.js';
export { tokenof, TOKENOF_NAME } from './tokenof.js';
