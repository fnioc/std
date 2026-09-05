// Public entry point for @rhombus-std/config.json: the JSON file and stream
// source/provider pairs, plus the builder sugar that registers them.
//
// A consumer who never names a runtime symbol from this package (only wants the
// sugar) needs a bare side-effect import: `import "@rhombus-std/config.json";`.
// This package must NOT set `"sideEffects": false` in package.json -- that would
// let a bundler tree-shake the augmentation away.

export * from './ConfigBuilder-Json-augmentations';
export * from './JsonConfigProvider';
export * from './JsonConfigSource';
export * from './JsonStreamConfigProvider';
export * from './JsonStreamConfigSource';
