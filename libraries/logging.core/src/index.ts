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
export { LogLevel } from "./LogLevel";

export type { ILoggingBuilder } from "./ILoggingBuilder";
export type { IExternalScopeProvider, ILogger } from "./logger";
export type { ILoggerFactory, ILoggerProvider } from "./logger-factory";

// The single log-entry record a provider-side sink receives (the reference
// `LogEntry<TState>`). Its reference home is this abstractions package; the
// console provider re-exports it from here.
export type { LogEntry } from "./log-entry";

// The provider-alias filtering marker (the reference `ProviderAliasAttribute`)
// and its reader — a provider class declares `static readonly [providerAlias]`.
export { getProviderAlias, providerAlias } from "./provider-alias";
export type { ProviderAliased } from "./provider-alias";

// Buffered logging: the batch-delivery capability a provider may implement
// beside `ILogger` (the reference `IBufferedLogger` + `BufferedLogRecord`).
export { BufferedLogRecord } from "./buffered-logger";
export type { IBufferedLogger } from "./buffered-logger";

// Deferred message formatting — exported so a provider-side sink can render or
// structurally destructure a `FormattedLogValues` state (its `[name, value]`
// pairs plus the `{OriginalFormat}` entry).
export { formatLogValues, formatMessage, FormattedLogValues } from "./formatted-log-values";

// The real-runtime ILogger convenience wrappers (LoggerExtensions analog):
// the standalone functions, the registered `LoggerExtensions` set, and the
// method-form surface each concrete logger class merges in (§28/§38; no
// ILogger interface merge, §36). Importing the barrel registers the set
// against the `ILogger` token as a side effect.
export {
  beginScope,
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

// The ILoggerFactory type-receiving createLogger wrapper (the reference
// `LoggerFactoryExtensions` analog). Standalone-only — its one member's name
// collides with ILoggerFactory's own `createLogger` primitive, so it is never
// registered or prototype-installed (§29/§40 exclusion precedent).
export { LoggerFactoryExtensions } from "./logger-factory-augmentations";
