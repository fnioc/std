// Token-derivation primitives resolved at compile time: the token pair
// `tokenfor` / `tokenof`, and the resolve-family predicates their sugar bodies
// compose (`isSingular` / `singularValue` / `isFactory` / `returntokenfor` /
// `paramtokensfor`). Every call is elided from the shipped output, so a
// consumer depends on this package build-time only.
//
// `registerInlineBodies` is the one export that isn't resolved at compile
// time — a runtime no-op marker placed beside an inline sugar body set to
// state, in code, that the set is published in its package's `package.json`
// "rhombus.inline" list.

export { IS_FACTORY_NAME, isFactory } from './isFactory.js';
export { IS_SINGULAR_NAME, isSingular } from './isSingular.js';
export { PARAM_TOKENSFOR_NAME, paramtokensfor } from './paramtokensfor.js';
export { type InlineBody, type InlineBodySet, registerInlineBodies } from './registerInlineBodies.js';
export { RETURN_TOKENFOR_NAME, returntokenfor } from './returntokenfor.js';
export { SINGULAR_VALUE_NAME, singularValue } from './singularValue.js';
export { tokenfor, TOKENFOR_NAME } from './tokenfor.js';
export { tokenof, TOKENOF_NAME } from './tokenof.js';
