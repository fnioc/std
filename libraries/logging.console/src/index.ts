// Public entry point for @rhombus-std/logging.console — the console-provider
// analog of the reference logging graph, at reference parity: the
// ConsoleLogger + ConsoleLoggerProvider runtime, the ConsoleFormatter
// abstraction with its three built-ins (simple with ANSI colors, json,
// systemd — internal, selected by name), the formatter/logger options model,
// and the async background queue writer (ConsoleLoggerProcessor, internal).
//
// Importing this module also installs the ConsoleLoggerExtensions surface
// (addConsole/addSimpleConsole/addJsonConsole/addSystemdConsole/
// addConsoleFormatter) onto ILoggingBuilder via the augmentation registry
// (./console-logger-augmentations). This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake that registration away.
//
// RESIDUALS — reference surface awaiting types from sibling packages:
//   - IBufferedLogger/BufferedLogRecord now live in @rhombus-std/logging.core,
//     but ConsoleLogger's buffered-records side and the formatters' buffered
//     fast paths are still not ported (no consumer wires the buffered path).
//   - ISupportExternalScope (logging.core) doesn't exist; the provider ports
//     its `setScopeProvider` member directly, and nothing injects an
//     IExternalScopeProvider yet (the factory-side scope plumbing).
//   - The config-binding wiring (ConsoleLoggerConfigureOptions,
//     ConsoleFormatterConfigureOptions, the formatter change-token sources,
//     `AddConsole`'s no-arg `addConfiguration()` call) needs
//     @rhombus-std/logging.config's `ILoggerProviderConfig<T>`
//     provider-configuration factory, which doesn't exist yet.

// LogEntry is re-exported from its reference home (the abstractions package)
// now that it lives there; the local declaration was retired.
export type { LogEntry } from '@rhombus-std/logging.core';
export { ConsoleFormatter } from './ConsoleFormatter';
export { ConsoleFormatterNames } from './ConsoleFormatterNames';
export { ConsoleFormatterOptions } from './ConsoleFormatterOptions';
export { ConsoleLogger } from './ConsoleLogger';
// Side-effect + standalone surface: registers the console augmentation set against
// the logging-builder token and exports the set (docs §38).
export { ConsoleLoggerExtensions } from './ConsoleLoggerExtensions';
export { ConsoleLoggerFormat } from './ConsoleLoggerFormat';
export { ConsoleLoggerOptions, DEFAULT_MAX_QUEUE_LENGTH } from './ConsoleLoggerOptions';
export { ConsoleLoggerProvider } from './ConsoleLoggerProvider';
export { ConsoleLoggerQueueFullMode } from './ConsoleLoggerQueueFullMode';
export { JsonConsoleFormatterOptions } from './JsonConsoleFormatterOptions';
export type { JsonWriterOptions } from './JsonConsoleFormatterOptions';
export { LoggerColorBehavior } from './LoggerColorBehavior';
export { SimpleConsoleFormatterOptions } from './SimpleConsoleFormatterOptions';
export { StringWriter } from './text-writer';
export type { TextWriter } from './text-writer';
