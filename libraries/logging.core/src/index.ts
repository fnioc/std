// Public entry point for @rhombus-std/logging.core — the logging contracts
// (ILogger/ILoggerFactory/ILoggerProvider/ILoggingBuilder), LogLevel, EventId,
// LogEntry, the IBufferedLogger buffered-logging capability, the ProviderAlias
// filtering marker, the LoggerMessage factories, and the convenience wrappers.

export * from './EventId';
export * from './LogLevel';

export type * from './ILogger';
export type * from './ILoggingBuilder';
export type * from './ISupportExternalScope';
export type * from './logger-factory';
// The generic-category logger; its category comes from the closing type's di
// token at registration. `ILogger<T>` is the same `ILogger` interface above.
export * from './logger-of-t';

// The log-entry record a provider-side sink receives.
export type * from './log-entry';

// The provider-alias filtering marker and its reader — a provider class declares
// `static readonly [providerAlias]`.
export * from './provider-alias';

// Buffered logging: the batch-delivery capability a provider may implement
// beside `ILogger`.
export * from './IBufferedLogger';

// The cached-delegate log/scope factories.
export * from './logger-message';

// Deferred message formatting — exported so a provider-side sink can render or
// structurally destructure a `FormattedLogValues` state (its `[name, value]`
// pairs plus the `{OriginalFormat}` entry).
export * from './formatted-log-values';

// The ILogger convenience wrappers: the standalone functions and the
// `LoggerAugmentations` set. Importing the barrel installs the method form onto
// every `@augment`-decorated `ILogger` as a side effect.
export * from './Logger-augmentations';

// The type-receiving `createLogger` wrapper. Importing the barrel makes it
// dot-callable on any `@augment`-decorated `ILoggerFactory` as a side effect.
export * from './LoggerFactory-augmentations';
