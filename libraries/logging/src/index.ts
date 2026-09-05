// Public entry point for @rhombus-std/logging.
//
// Importing this module installs the `ILoggingBuilder` augmentations
// (addProvider/setMinimumLevel/addFilter/…) via declaration-merging side
// effects. A consumer who only wants those writes a bare
// `import "@rhombus-std/logging";`. This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake them away.

// Re-exports this family's core (the ILogger* abstractions plus the runtime
// helpers consumers extend) so a consumer depending on this package resolves
// the abstractions from it too. Where a name is defined both here and in core
// (e.g. `Logger`), the concrete export below wins.
export * from '@rhombus-std/logging.core';

// `getLoggingManifest`: the logging registrations, published as a manifest a
// consumer merges into their own.
export * from './manifests';
// Registers the ILoggingBuilder augmentations (addProvider/…).
export * from './LoggingBuilder-Provider-augmentations';
// Installs LoggerFilterOptions's addFilter directly, and registers the
// ILoggingBuilder half that routes through the options-configure pipeline.
export * from './filter-augmentations';
export { Logger } from './Logger';
export * from './LoggerExternalScopeProvider';
export * from './LoggerFactory';
export * from './LoggerFilterOptions';
export { LoggingBuilder } from './LoggingBuilder';
export * from './null-logger';
export * from './types';
