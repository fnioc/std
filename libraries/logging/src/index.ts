// Public entry point for @rhombus-std/logging — the ME.Logging (impl) analog.
//
// Importing this module installs the `addLogging` sugar onto
// @rhombus-std/di.core's ServiceManifest via the declaration-merging
// side-effect augmentation (./add-logging). A consumer who only wants that
// sugar writes a bare `import "@rhombus-std/logging";`. This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake the augmentation away.

// Side-effect + standalone surface: patches ServiceManifestClass.prototype.addLogging,
// merges the method onto the di.core ServiceManifestBase interface, and exports the
// standalone `loggingExtensions` set (docs §17).
export { loggingExtensions } from "./add-logging";
// Side-effect: installs the ILoggingBuilder extensions (addProvider/... ) as
// instance methods onto LoggingBuilder -- the reverse-direction dual-export half.
import "./builder-augmentations";

export { addProvider, clearProviders, setMinimumLevel } from "./builder-extensions";
export { addFilter } from "./filter-extensions";
export { Logger } from "./logger";
export { LoggerFactory } from "./logger-factory";
export { LoggerFilterOptions, LoggerFilterRule } from "./logger-filter-options";
export { LoggingBuilder } from "./logging-builder";
export { NullLogger, NullLoggerFactory, NullLoggerProvider } from "./null-logger";
export { LOGGER_FACTORY_TOKEN, LOGGER_PROVIDER_TOKEN } from "./tokens";
