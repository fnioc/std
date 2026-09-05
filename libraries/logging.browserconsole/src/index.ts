// Public entry point for @rhombus-std/logging.browserconsole — the browser
// console sink for logging.core's ILogger/ILoggerProvider. Plain formatting,
// no ANSI: the browser devtools style each severity channel.
//
// IMPORTING THIS PACKAGE HAS A SIDE EFFECT: it registers the
// `BrowserConsoleLoggerAugmentations` set (the `addBrowserConsole` member) against
// logging.core's ILoggingBuilder augmentation type, so the @augment-decorated
// concrete LoggingBuilder gains the fluent `addBrowserConsole()` method form.

export * from './BrowserConsoleLogger';
export * from './BrowserConsoleLoggerProvider';
export type { ConsoleLike } from './ConsoleLike';

// The ILoggingBuilder augmentation set (+ its side-effect registration).
export * from './LoggingBuilder-BrowserConsole-augmentations';
