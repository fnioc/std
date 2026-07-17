// Public entry point for @rhombus-std/primitives -- the change-token
// primitives ported from ME.Primitives (see docs/decisions.md #0: the
// universal leaf every other family builds on).
//
// StringValues/StringSegment are NOT ported yet -- see the README.

export { AbortController, neverSignal } from './abort.js';
export type { AbortControllerConstructor, AbortSignal } from './abort.js';
export { augment, registerAugmentations } from './augmentation-registry.js';
export { applyAugmentations } from './augmentations.js';
export type { AugmentationSet, MergeStrategies, MergeStrategy } from './augmentations.js';
export { CancellationChangeToken } from './CancellationChangeToken.js';
export { ChangeToken } from './ChangeToken.js';
export type { ChangeTokenConsumer, ChangeTokenProducer } from './ChangeToken.js';
export { CompositeChangeToken } from './CompositeChangeToken.js';
export type { IChangeToken } from './IChangeToken.js';
export { Multimap } from './Multimap.js';
export { nameof, NAMEOF_NAME } from './nameof.js';
export { process } from './process.js';
export type { ProcessLike } from './process.js';
export type { ReadableStream } from './ReadableStream.js';
export { clearTimeout, setTimeout } from './TimeoutHandle.js';
export type { TimeoutHandle } from './TimeoutHandle.js';
export type { Token } from './Token.js';
