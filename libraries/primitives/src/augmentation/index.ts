// The augmentation engine's whole public surface: three ways to mount a set of
// `this`-based functions onto a receiver's prototype, and the types their
// signatures name. Everything else in this directory — the registry's bags and
// subscriber lists, the installer's guards — is reachable only from inside it,
// so a later addition here is a deliberate act rather than an `export *` away.

export { applyAugmentations } from './apply-augmentations';
export type { AugmentationSet, MergeStrategies, MergeStrategy } from './apply-augmentations';
export { augment, registerAugmentations } from './registry';
