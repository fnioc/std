// The convenience logging wrappers, ported from ME.Logging.Abstractions'
// static `LoggerExtensions` class (`LogTrace`/`LogDebug`/`LogInformation`/
// `LogWarning`/`LogError`/`LogCritical` + the level-parameterized `Log`).
//
// Per this repo's "explicit form is primary" convention, extension methods
// against an interface THIS family owns (`ILogger`) are plain exported
// functions taking the logger as the first parameter — no augmentation.
//
// Collapsing the reference overloads: each reference level method has four
// overloads keyed on an optional leading `EventId` and optional `Exception`.
// TS has no overload dispatch on a leading value type without runtime probing,
// so this collapses to two forms per level — `(logger, message, ...args)` and
// `(logger, error, message, ...args)` — disambiguated at runtime by whether the
// first post-logger arg is an `Error`. The `EventId`-carrying overloads are
// intentionally dropped (deferred; noted in the README) since a bare integer
// event id and a message string are ambiguous at runtime; a caller that needs
// an explicit event id calls `logger.log(level, EventId.from(n), …)` directly.

import { EventId } from "./event-id";
import { formatLogValues, FormattedLogValues } from "./formatted-log-values";
import { LogLevel } from "./log-level";
import type { ILogger } from "./logger";

/** Routes a wrapper call to the primitive `ILogger.log`, splitting the optional leading error. */
function emit(logger: ILogger, logLevel: LogLevel, first: string | Error, rest: readonly unknown[]): void {
  let error: Error | undefined;
  let message: string;
  let args: readonly unknown[];
  if (first instanceof Error) {
    error = first;
    message = typeof rest[0] === "string" ? rest[0] : "";
    args = rest.slice(1);
  } else {
    error = undefined;
    message = first;
    args = rest;
  }
  logger.log(logLevel, EventId.from(0), new FormattedLogValues(message, args), error, formatLogValues);
}

/** Formats and writes a trace-level log message. */
export function logTrace(logger: ILogger, message: string, ...args: unknown[]): void;
export function logTrace(logger: ILogger, error: Error, message: string, ...args: unknown[]): void;
export function logTrace(logger: ILogger, first: string | Error, ...rest: unknown[]): void {
  emit(logger, LogLevel.Trace, first, rest);
}

/** Formats and writes a debug-level log message. */
export function logDebug(logger: ILogger, message: string, ...args: unknown[]): void;
export function logDebug(logger: ILogger, error: Error, message: string, ...args: unknown[]): void;
export function logDebug(logger: ILogger, first: string | Error, ...rest: unknown[]): void {
  emit(logger, LogLevel.Debug, first, rest);
}

/** Formats and writes an informational log message. */
export function logInformation(logger: ILogger, message: string, ...args: unknown[]): void;
export function logInformation(logger: ILogger, error: Error, message: string, ...args: unknown[]): void;
export function logInformation(logger: ILogger, first: string | Error, ...rest: unknown[]): void {
  emit(logger, LogLevel.Information, first, rest);
}

/** Formats and writes a warning-level log message. */
export function logWarning(logger: ILogger, message: string, ...args: unknown[]): void;
export function logWarning(logger: ILogger, error: Error, message: string, ...args: unknown[]): void;
export function logWarning(logger: ILogger, first: string | Error, ...rest: unknown[]): void {
  emit(logger, LogLevel.Warning, first, rest);
}

/** Formats and writes an error-level log message. */
export function logError(logger: ILogger, message: string, ...args: unknown[]): void;
export function logError(logger: ILogger, error: Error, message: string, ...args: unknown[]): void;
export function logError(logger: ILogger, first: string | Error, ...rest: unknown[]): void {
  emit(logger, LogLevel.Error, first, rest);
}

/** Formats and writes a critical-level log message. */
export function logCritical(logger: ILogger, message: string, ...args: unknown[]): void;
export function logCritical(logger: ILogger, error: Error, message: string, ...args: unknown[]): void;
export function logCritical(logger: ILogger, first: string | Error, ...rest: unknown[]): void {
  emit(logger, LogLevel.Critical, first, rest);
}

/** Formats and writes a log message at the specified {@link LogLevel}. */
export function log(logger: ILogger, logLevel: LogLevel, message: string, ...args: unknown[]): void;
export function log(logger: ILogger, logLevel: LogLevel, error: Error, message: string, ...args: unknown[]): void;
export function log(logger: ILogger, logLevel: LogLevel, first: string | Error, ...rest: unknown[]): void {
  emit(logger, logLevel, first, rest);
}
