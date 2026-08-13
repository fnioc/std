// Token-derivation primitives resolved at compile time: the token pair
// `tokenfor` / `tokenof`. Every call is elided from the shipped output, so a
// consumer depends on this package build-time only.
//
// `registerInlineBodies` is the one export that isn't resolved at compile
// time — a runtime no-op marker placed beside an inline sugar body set to
// state, in code, that the set is published in its package's `package.json`
// "rhombus-std" marker "inline" list.

export { REGISTER_AUGMENTATIONS_NAME, registerAugmentations } from './registerAugmentations.js';
export { type InlineBody, type InlineBodySet, registerInlineBodies } from './registerInlineBodies.js';
export { tokenfor, TOKENFOR_NAME } from './tokenfor.js';
export { tokenof, TOKENOF_NAME } from './tokenof.js';
export { type TypeFor, typefor, TYPEFOR_NAME } from './typefor.js';
