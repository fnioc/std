// Public entry point for @rhombus-std/primitives -- the change-token trio
// ported from ME.Primitives (see docs/decisions.md #0: the
// universal leaf every other family builds on).
//
// StringValues/StringSegment are NOT ported yet -- see the README.

export { applyAugmentations } from "./augmentations.js";
export type { AugmentationSet } from "./augmentations.js";
export { CancellationChangeToken } from "./cancellation-change-token.js";
export type { IChangeToken } from "./change-token.js";
export { ChangeToken } from "./on-change.js";
export type { ChangeTokenProducer } from "./on-change.js";
