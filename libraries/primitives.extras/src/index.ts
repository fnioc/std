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
//
// Beside them it ships one construct that is NOT a transformable:
// `registerInlineBodies`, the module-level marker a package places beside each
// inline sugar body set to state — in code — that the set is published in its
// `package.json` "rhombus.inline" list. It is never lowered and never runs (the
// files it appears in are never bundled); it belongs here because it is
// authoring-time-only like everything else above, and because this is the one
// package every body-carrying package already depends on.

export { IS_FACTORY_NAME, isFactory } from './isFactory.js';
export { IS_SINGULAR_NAME, isSingular } from './isSingular.js';
export { PARAM_TOKENSFOR_NAME, paramtokensfor } from './paramtokensfor.js';
export { type InlineBody, type InlineBodySet, registerInlineBodies } from './registerInlineBodies.js';
export { RETURN_TOKENFOR_NAME, returntokenfor } from './returntokenfor.js';
export { SINGULAR_VALUE_NAME, singularValue } from './singularValue.js';
export { tokenfor, TOKENFOR_NAME } from './tokenfor.js';
export { tokenof, TOKENOF_NAME } from './tokenof.js';
