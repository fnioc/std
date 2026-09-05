// Public entry point for @rhombus-std/logging.console: the ConsoleLogger +
// ConsoleLoggerProvider runtime, the ConsoleFormatter abstraction with its
// three built-ins (simple with ANSI colors, json, systemd — internal,
// selected by name), the formatter/logger options model, and the async
// background queue writer (ConsoleLoggerProcessor, internal).
//
// Importing this module also installs the ConsoleLoggerAugmentations surface
// (addConsole/addSimpleConsole/addJsonConsole/addSystemdConsole/
// addConsoleFormatter) onto ILoggingBuilder via the augmentation registry
// (./console-logger-augmentations). This package MUST keep
// `"sideEffects": true` so a bundler cannot tree-shake that registration away.

export type { LogEntry } from '@rhombus-std/logging.core';
export * from './ConsoleFormatter';
export * from './ConsoleFormatterNames';
export * from './ConsoleFormatterOptions';
export * from './ConsoleLogger';
export * from './ConsoleLoggerOptions';
export * from './ConsoleLoggerProvider';
export * from './ConsoleLoggerQueueFullMode';
export * from './JsonConsoleFormatterOptions';
export * from './LoggerColorBehavior';
export * from './LoggingBuilder-Console-augmentations';
export * from './SimpleConsoleFormatterOptions';
export * from './text-writer';
