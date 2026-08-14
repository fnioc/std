// Public entry point for @rhombus-std/config.file -- the shared base layer for
// file-backed configuration providers (JSON, INI, XML).
//
// Exports the abstract FileConfigSource/FileConfigProvider pair every
// file-format provider derives from, the FileLoadErrorContext handed to a
// load-error handler, the FormatError/InvalidDataError types, and the builder
// augmentations carrying the file defaults.
//
// A consumer who only wants the augmentation needs a bare side-effect import:
// `import "@rhombus-std/config.file";`. `sideEffects: true` in package.json
// keeps a bundler from tree-shaking the registration away.

export * from './ConfigBuilder-File-augmentations';
export * from './errors';
export * from './FileConfigProvider';
export * from './FileConfigSource';
export type * from './FileLoadErrorContext';
