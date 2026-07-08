// Public entry point for @rhombus-std/logging.core — the ME.Logging.Abstractions
// analog. Ships the logging contracts (ILogger/ILoggerFactory/ILoggerProvider/
// ILoggingBuilder + IExternalScopeProvider), the LogLevel enum, the EventId
// value type, and the real-runtime convenience wrappers (logInformation/…).
//
// Mirror of the reference edge `Logging.Abstractions -> DependencyInjection.
// Abstractions`: the only external dependency is @rhombus-std/di.core, used for
// the `ServiceManifest` type that `ILoggingBuilder.services` is bound to.

export { EventId } from "./event-id";
export type { EventIdLike } from "./event-id";
export { LogLevel } from "./log-level";

export type { IExternalScopeProvider, ILogger } from "./logger";
export type { ILoggerFactory, ILoggerProvider } from "./logger-factory";
export type { ILoggingBuilder } from "./logging-builder";

// Deferred message formatting — exported so a provider-side sink (once
// providers land) can render or destructure a `FormattedLogValues` state.
export { formatLogValues, formatMessage, FormattedLogValues } from "./formatted-log-values";

// The real-runtime ILogger convenience wrappers (LoggerExtensions analog).
export { log, logCritical, logDebug, logError, logInformation, logTrace, logWarning } from "./logger-extensions";
