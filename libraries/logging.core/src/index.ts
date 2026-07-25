// Public entry point for @rhombus-std/logging.core — the logging contracts
// (ILogger/ILoggerFactory/ILoggerProvider/ILoggingBuilder), LogLevel, EventId,
// LogEntry, the IBufferedLogger buffered-logging capability, the ProviderAlias
// filtering marker, the LoggerMessage factories, and the convenience wrappers.

export { EventId } from './EventId';
export type { EventIdLike } from './EventId';
export { LogLevel } from './LogLevel';

export type { IExternalScopeProvider, ILogger } from './ILogger';
export type { ILoggingBuilder } from './ILoggingBuilder';
export type { ISupportExternalScope } from './ISupportExternalScope';
export type { ILoggerFactory, ILoggerProvider } from './logger-factory';
// The generic-category logger; its category comes from the closing type's di
// token at registration. `ILogger<T>` is the same `ILogger` interface above.
export { Logger } from './logger-of-t';

// The log-entry record a provider-side sink receives.
export type { LogEntry } from './log-entry';

// The provider-alias filtering marker and its reader — a provider class declares
// `static readonly [providerAlias]`.
export { getProviderAlias, providerAlias } from './provider-alias';
export type { ProviderAliased } from './provider-alias';

// Buffered logging: the batch-delivery capability a provider may implement
// beside `ILogger`.
export { BufferedLogRecord } from './IBufferedLogger';
export type { IBufferedLogger } from './IBufferedLogger';

// The cached-delegate log/scope factories.
export { LoggerMessage } from './logger-message';
export type { LogDefineOptions } from './logger-message';

// Deferred message formatting — exported so a provider-side sink can render or
// structurally destructure a `FormattedLogValues` state (its `[name, value]`
// pairs plus the `{OriginalFormat}` entry).
export { formatLogValues, formatMessage, FormattedLogValues } from './formatted-log-values';

// The ILogger convenience wrappers: the standalone functions and the
// `LoggerExtensions` set. Importing the barrel installs the method form onto
// every `@augment`-decorated `ILogger` as a side effect.
export { beginScope, log, logCritical, logDebug, logError, LoggerExtensions, logInformation, logTrace,
  logWarning } from './LoggerExtensions';

// The type-receiving `createLogger` wrapper. Importing the barrel makes it
// dot-callable on any `@augment`-decorated `ILoggerFactory` as a side effect.
export { LoggerFactoryExtensions } from './LoggerFactoryExtensions';
