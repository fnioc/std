// Public entry point for @rhombus-std/logging.core — the ME.Logging.Abstractions
// analog. Ships the logging contracts (ILogger/ILoggerFactory/ILoggerProvider/
// ILoggingBuilder + IExternalScopeProvider), the LogLevel enum, the EventId
// value type, and the real-runtime convenience wrappers (logInformation/…).
//
// Mirror of the reference edge `Logging.Abstractions -> DependencyInjection.
// Abstractions`: @rhombus-std/di.core supplies the `ServiceManifest` type that
// `ILoggingBuilder.services` is bound to, and @rhombus-std/primitives supplies
// the augmentation registry the `LoggerExtensions` set self-registers with (§38).

export { EventId } from "./event-id";
export type { EventIdLike } from "./event-id";
export { LogLevel } from "./log-level";

export type { IExternalScopeProvider, ILogger } from "./logger";
export type { ILoggerFactory, ILoggerProvider } from "./logger-factory";
export type { ILoggingBuilder } from "./logging-builder";

// Deferred message formatting — exported so a provider-side sink (once
// providers land) can render or destructure a `FormattedLogValues` state.
export { formatLogValues, formatMessage, FormattedLogValues } from "./formatted-log-values";

// The real-runtime ILogger convenience wrappers (LoggerExtensions analog):
// the standalone functions, the registered `LoggerExtensions` set, and the
// method-form surface each concrete logger class merges in (§28/§38; no
// ILogger interface merge, §36). Importing the barrel registers the set
// against the `ILogger` token as a side effect.
export {
  log,
  logCritical,
  logDebug,
  logError,
  LoggerExtensions,
  logInformation,
  logTrace,
  logWarning,
} from "./logger-augmentations";
export type { LoggerExtensionMethods } from "./logger-augmentations";
