// Public entry point for @rhombus-std/logging.browserconsole — the browser
// console sink for @rhombus-std/logging.core's ILogger/ILoggerProvider
// contracts. Writes through the platform `console` global with each LogLevel
// mapped onto its console method (Trace/Debug -> console.debug, Information ->
// console.info, Warning -> console.warn, Error/Critical -> console.error);
// plain formatting, no ANSI — the browser devtools style each channel.
//
// IMPORTING THIS PACKAGE HAS A SIDE EFFECT: it registers the
// `BrowserConsoleLoggerExtensions` set (the `addBrowserConsole` member) against
// logging.core's ILoggingBuilder augmentation token, so the @augment-decorated
// concrete LoggingBuilder gains the fluent `addBrowserConsole()` method form.

export { BrowserConsoleLogger, type ConsoleMethod, consoleMethodFor } from './BrowserConsoleLogger';
export { BrowserConsoleLoggerProvider } from './BrowserConsoleLoggerProvider';
export type { ConsoleLike } from './console-global';

// The ILoggingBuilder augmentation set (+ its side-effect registration).
export { BrowserConsoleLoggerExtensions } from './browser-console-logger-augmentations';
