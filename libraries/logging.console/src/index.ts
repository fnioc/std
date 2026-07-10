// Public entry point for @rhombus-std/logging.console — the console-provider
// analog of the reference logging graph. Ships the concrete ConsoleLogger +
// ConsoleLoggerProvider against @rhombus-std/logging.core's contracts.
//
// The advanced reference surface (formatter registry, formatter/logger
// options, colors, scopes, log-level configuration binding, background queue
// writer) is intentionally omitted this pass.
//
// Importing this module also installs the `addConsole` sugar onto ILoggingBuilder
// via the augmentation registry (./console-logger-augmentations). This package MUST
// keep `"sideEffects": true` so a bundler cannot tree-shake that registration away.

export { ConsoleLogger } from "./console-logger";
// Side-effect + standalone surface: registers the `addConsole` augmentation against
// the logging-builder token and exports the set (docs §38).
export { ConsoleLoggerExtensions } from "./console-logger-augmentations";
export { ConsoleLoggerProvider } from "./ConsoleLoggerProvider";
