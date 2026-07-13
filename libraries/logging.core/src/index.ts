// Public entry point for @rhombus-std/logging.core — the ME.Logging.Abstractions
// analog. Ships the logging contracts (ILogger/ILoggerFactory/ILoggerProvider/
// ILoggingBuilder + IExternalScopeProvider), the LogLevel enum, the EventId
// value type, the LogEntry record, the IBufferedLogger/BufferedLogRecord
// buffered-logging capability, the ProviderAlias filtering marker, the
// LoggerMessage cached-delegate factories, and the real-runtime convenience
// wrappers (logInformation/…, beginScope).
//
// Mirror of the reference edge `Logging.Abstractions -> DependencyInjection.
// Abstractions`: @rhombus-std/di.core supplies the `ServiceManifest` type that
// `ILoggingBuilder.services` is bound to, and @rhombus-std/primitives supplies
// the augmentation registry the `LoggerExtensions` set self-registers with (§38).

export { EventId } from './event-id';
export type { EventIdLike } from './event-id';
export { LogLevel } from './LogLevel';

export type { ILoggingBuilder } from './ILoggingBuilder';
export type { IExternalScopeProvider, ILogger } from './logger';
export type { ILoggerFactory, ILoggerProvider } from './logger-factory';
export type { ISupportExternalScope } from './support-external-scope';
// The generic-category logger (reference `Logger<T>`); its category comes from
// the closing type's di token at registration. `ILogger<T>` is the same
// `ILogger` interface above (a defaulted phantom type parameter — see ./logger).
export { Logger } from './logger-of-t';

// The single log-entry record a provider-side sink receives (the reference
// `LogEntry<TState>`). Its reference home is this abstractions package; the
// console provider re-exports it from here.
export type { LogEntry } from './log-entry';

// The provider-alias filtering marker (the reference `ProviderAliasAttribute`)
// and its reader — a provider class declares `static readonly [providerAlias]`.
export { getProviderAlias, providerAlias } from './provider-alias';
export type { ProviderAliased } from './provider-alias';

// Buffered logging: the batch-delivery capability a provider may implement
// beside `ILogger` (the reference `IBufferedLogger` + `BufferedLogRecord`).
export { BufferedLogRecord } from './buffered-logger';
export type { IBufferedLogger } from './buffered-logger';

// The cached-delegate factories (the reference `LoggerMessage` runtime half).
export { LoggerMessage } from './logger-message';
export type { LogDefineOptions } from './logger-message';

// Deferred message formatting — exported so a provider-side sink can render or
// structurally destructure a `FormattedLogValues` state (its `[name, value]`
// pairs plus the `{OriginalFormat}` entry).
export { formatLogValues, formatMessage, FormattedLogValues } from './formatted-log-values';

// The real-runtime ILogger convenience wrappers (LoggerExtensions analog):
// the standalone functions and the registered `LoggerExtensions` set. The
// method-form surface is merged onto `ILogger` itself (§28/§38; the §36/§48
// many-implementers carve-out retired, §80). Importing the barrel registers
// the set against the `ILogger` token as a side effect.
export { beginScope, log, logCritical, logDebug, logError, LoggerExtensions, logInformation, logTrace,
  logWarning } from './logger-augmentations';

// The ILoggerFactory type-receiving createLogger wrapper (the reference
// `LoggerFactoryExtensions` analog). Its member shares ILoggerFactory's own
// `createLogger` primitive name, so it registers with a merge strategy that
// dispatches a type (constructor) to the wrapper and a category string to the
// primitive — dot-callable at runtime on any `@augment`-decorated factory.
// Importing the barrel registers the set against the `ILoggerFactory` token as a
// side effect.
export { LoggerFactoryExtensions } from './logger-factory-augmentations';
