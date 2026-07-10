// Public entry point for @rhombus-std/primitives -- the change-token trio
// ported from ME.Primitives (see docs/decisions.md #0: the
// universal leaf every other family builds on).
//
// StringValues/StringSegment are NOT ported yet -- see the README.

export { AbortController } from "./abort.js";
export type { AbortControllerConstructor, AbortSignal } from "./abort.js";
export { augment, registerAugmentations } from "./augmentation-registry.js";
export { applyAugmentations } from "./augmentations.js";
export type { AugmentationSet } from "./augmentations.js";
export { CancellationChangeToken } from "./CancellationChangeToken.js";
export type { IChangeToken } from "./IChangeToken.js";
export { ChangeToken } from "./on-change.js";
export type { ChangeTokenProducer } from "./on-change.js";
export type { Token } from "./Token.js";
