// @rhombus-std/config.extras — the authoring surface for the `.withType<T>()`
// schema sugar.
//
// A named re-export rather than a side-effect import: a `rhombus-std` inline
// entry's `impl` is resolved by walking this entry's re-export graph, so a set
// that is only imported for its registration is never found.

export * from './augmentations/ConfigBuilder-schema-augmentations.js';
