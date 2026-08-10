// Public entry point for @rhombus-std/logging.browserconsole — the browser
// console sink for logging.core's ILogger/ILoggerProvider. Plain formatting,
// no ANSI: the browser devtools style each severity channel.
//
// IMPORTING THIS PACKAGE HAS A SIDE EFFECT: it registers the
// `BrowserConsoleLoggerAugmentations` set (the `addBrowserConsole` member) against
// logging.core's ILoggingBuilder augmentation token, so the @augment-decorated
// concrete LoggingBuilder gains the fluent `addBrowserConsole()` method form.

export { BrowserConsoleLogger, type ConsoleMethod, consoleMethodFor } from './BrowserConsoleLogger';
export { BrowserConsoleLoggerProvider } from './BrowserConsoleLoggerProvider';
export type { ConsoleLike } from './ConsoleLike';

// The ILoggingBuilder augmentation set (+ its side-effect registration).
export { BrowserConsoleLoggerAugmentations } from './LoggingBuilder-BrowserConsole-augmentations';
