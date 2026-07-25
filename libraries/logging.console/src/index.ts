// Public entry point for @rhombus-std/logging.console: the ConsoleLogger +
// ConsoleLoggerProvider runtime, the ConsoleFormatter abstraction with its
// three built-ins (simple with ANSI colors, json, systemd — internal,
// selected by name), the formatter/logger options model, and the async
// background queue writer (ConsoleLoggerProcessor, internal).
//
// Importing this module also installs the ConsoleLoggerExtensions surface
// (addConsole/addSimpleConsole/addJsonConsole/addSystemdConsole/
// addConsoleFormatter) onto ILoggingBuilder via the augmentation registry
// (./console-logger-augmentations). This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake that registration away.

export type { LogEntry } from '@rhombus-std/logging.core';
export { ConsoleFormatter } from './ConsoleFormatter';
export { ConsoleFormatterNames } from './ConsoleFormatterNames';
export { ConsoleFormatterOptions } from './ConsoleFormatterOptions';
export { ConsoleLogger } from './ConsoleLogger';
export { ConsoleLoggerExtensions } from './ConsoleLoggerExtensions';
export { ConsoleLoggerOptions, DEFAULT_MAX_QUEUE_LENGTH } from './ConsoleLoggerOptions';
export { ConsoleLoggerProvider } from './ConsoleLoggerProvider';
export { ConsoleLoggerQueueFullMode } from './ConsoleLoggerQueueFullMode';
export { JsonConsoleFormatterOptions } from './JsonConsoleFormatterOptions';
export type { JsonWriterOptions } from './JsonConsoleFormatterOptions';
export { LoggerColorBehavior } from './LoggerColorBehavior';
export { SimpleConsoleFormatterOptions } from './SimpleConsoleFormatterOptions';
export { StringWriter } from './text-writer';
export type { TextWriter } from './text-writer';
