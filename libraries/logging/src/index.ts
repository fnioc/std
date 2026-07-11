// Public entry point for @rhombus-std/logging — the ME.Logging (impl) analog.
//
// Importing this module installs the `addLogging` sugar onto
// @rhombus-std/di.core's ServiceManifest via the declaration-merging
// side-effect augmentation (./add-logging). A consumer who only wants that
// sugar writes a bare `import "@rhombus-std/logging";`. This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake the augmentation away.

// Side-effect + standalone surface: registers the `addLogging` augmentation against
// the di.core ServiceManifest token, merges the method onto the ServiceManifestBase
// interface, and exports the `LoggingServiceCollectionExtensions` set (docs §28/§38).
export { LoggingServiceCollectionExtensions } from "./add-logging";
// Side-effect + standalone surface: registers the ILoggingBuilder augmentations
// (addProvider/…) against the logging-builder token so the @augment-decorated
// LoggingBuilder pulls them onto its prototype, and exports the set (docs §38).
export { LoggingBuilderExtensions } from "./builder-augmentations";
// Side-effect + standalone surface: installs the LoggerFilterOptions augmentation
// (addFilter) directly onto the concrete value object (CLOSED set, #105), registers
// the ILoggingBuilder half (the builder-level addFilter, routed through the
// options-configure pipeline) against the logging-builder token, and exports both
// sets.
export { FilterLoggingBuilderExtensions, LoggerFilterOptionsExtensions } from "./filter-augmentations";
export { Logger } from "./logger";
export { LoggerExternalScopeProvider } from "./logger-external-scope-provider";
export { LoggerFilterOptions, LoggerFilterRule } from "./logger-filter-options";
export { LoggerFactory } from "./LoggerFactory";
export { LoggingBuilder } from "./LoggingBuilder";
export { NullLogger, NullLoggerFactory, NullLoggerProvider } from "./null-logger";
export { LOGGER_FACTORY_TOKEN, LOGGER_FILTER_OPTIONS_TOKEN, LOGGER_PROVIDER_TOKEN } from "./tokens";
