export * from './signatureof.js';

// Named rather than a side-effect import: a `rhombus-std` inline entry's `impl` is
// resolved by walking this entry's re-export graph, so a set that is only
// imported for its registration is never found.
export * from './augmentations/Manifest-Descriptor-augmentations.js';
export * from './augmentations/Manifest-service-augmentations.js';
export * from './augmentations/ServiceProvider-service-augmentations.js';
