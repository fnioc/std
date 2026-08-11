// The convenience logging wrappers: `logTrace`/`logDebug`/`logInformation`/
// `logWarning`/`logError`/`logCritical`, plus the level-parameterized `log`.
//
// Dual export: the receiver-first functions are exported plain (the standalone
// surface) and also registered against the `ILogger` token as one set, so every
// concrete logger decorated with `@augment(typefor<ILogger>())` gains them as
// methods.
//
// Each level collapses to two call forms — `(logger, message, ...args)` and
// `(logger, error, message, ...args)` — disambiguated at runtime by whether
// the first argument after `logger` is an `Error`. There is no explicit
// event-id overload: a caller that needs one calls
// `logger.log(level, EventId.from(n), …)` directly.

import { type AugmentationSet2, type Flatten, type MergeStrategies,
  registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor, typefor } from '@rhombus-std/primitives.extras';
import { EventId } from './EventId';
import { formatLogValues, FormattedLogValues } from './formatted-log-values';
import type { ILogger } from './ILogger';
import { LogLevel } from './LogLevel';

/** Routes a wrapper call to the primitive `ILogger.log`, splitting the optional leading error. */
function emit(logger: ILogger, logLevel: LogLevel, first: string | Error, rest: readonly unknown[]): void {
  let error: Error | undefined;
  let message: string;
  let args: readonly unknown[];
  if (first instanceof Error) {
    error = first;
    message = typeof rest[0] === 'string' ? rest[0] : '';
    args = rest.slice(1);
  } else {
    error = undefined;
    message = first;
    args = rest;
  }
  logger.log(logLevel, EventId.from(0), new FormattedLogValues(message, args), error, formatLogValues);
}

export function logTrace(logger: ILogger, message: string, ...args: unknown[]): void;
export function logTrace(logger: ILogger, error: Error, message: string, ...args: unknown[]): void;
export function logTrace(logger: ILogger, first: string | Error, ...rest: unknown[]): void {
  emit(logger, LogLevel.Trace, first, rest);
}

export function logDebug(logger: ILogger, message: string, ...args: unknown[]): void;
export function logDebug(logger: ILogger, error: Error, message: string, ...args: unknown[]): void;
export function logDebug(logger: ILogger, first: string | Error, ...rest: unknown[]): void {
  emit(logger, LogLevel.Debug, first, rest);
}

export function logInformation(logger: ILogger, message: string, ...args: unknown[]): void;
export function logInformation(logger: ILogger, error: Error, message: string, ...args: unknown[]): void;
export function logInformation(logger: ILogger, first: string | Error, ...rest: unknown[]): void {
  emit(logger, LogLevel.Information, first, rest);
}

export function logWarning(logger: ILogger, message: string, ...args: unknown[]): void;
export function logWarning(logger: ILogger, error: Error, message: string, ...args: unknown[]): void;
export function logWarning(logger: ILogger, first: string | Error, ...rest: unknown[]): void {
  emit(logger, LogLevel.Warning, first, rest);
}

export function logError(logger: ILogger, message: string, ...args: unknown[]): void;
export function logError(logger: ILogger, error: Error, message: string, ...args: unknown[]): void;
export function logError(logger: ILogger, first: string | Error, ...rest: unknown[]): void {
  emit(logger, LogLevel.Error, first, rest);
}

export function logCritical(logger: ILogger, message: string, ...args: unknown[]): void;
export function logCritical(logger: ILogger, error: Error, message: string, ...args: unknown[]): void;
export function logCritical(logger: ILogger, first: string | Error, ...rest: unknown[]): void {
  emit(logger, LogLevel.Critical, first, rest);
}

export function log(logger: ILogger, logLevel: LogLevel, message: string, ...args: unknown[]): void;
export function log(logger: ILogger, logLevel: LogLevel, error: Error, message: string, ...args: unknown[]): void;
export function log(logger: ILogger, logLevel: LogLevel, first: string | Error, ...rest: unknown[]): void {
  emit(logger, logLevel, first, rest);
}

/**
 * Formats a message template and begins a logical operation scope on
 * `logger`. Returns the scope `Disposable` (dispose to end the scope), or
 * `undefined` when the logger does not support scopes.
 */
export function beginScope(logger: ILogger, messageFormat: string, ...args: unknown[]): Disposable | undefined {
  return logger.beginScope(new FormattedLogValues(messageFormat, args));
}

interface ILoggerAugmentations {
  logTrace(message: string, ...args: unknown[]): void;
  logTrace(error: Error, message: string, ...args: unknown[]): void;
  logDebug(message: string, ...args: unknown[]): void;
  logDebug(error: Error, message: string, ...args: unknown[]): void;
  logInformation(message: string, ...args: unknown[]): void;
  logInformation(error: Error, message: string, ...args: unknown[]): void;
  logWarning(message: string, ...args: unknown[]): void;
  logWarning(error: Error, message: string, ...args: unknown[]): void;
  logError(message: string, ...args: unknown[]): void;
  logError(error: Error, message: string, ...args: unknown[]): void;
  logCritical(message: string, ...args: unknown[]): void;
  logCritical(error: Error, message: string, ...args: unknown[]): void;
}

/**
 * `log` and `beginScope` are kept out of the merge below: their names ARE
 * `ILogger`'s own primitives, and TS refuses to merge an incompatible overload
 * onto a body-declared method (TS2430). They are not excluded at RUNTIME -- the
 * registration installs them with a merge strategy that dispatches the
 * primitive-shaped call to the primitive and the convenience-shaped call to the
 * wrapper, so the convenience form stays dot-callable. Their typed path is the
 * standalone `log(logger, ...)` / `beginScope(logger, ...)` function.
 */
interface ILoggerStandaloneWrappers {
  log(logLevel: LogLevel, message: string, ...args: unknown[]): void;
  log(logLevel: LogLevel, error: Error, message: string, ...args: unknown[]): void;
  beginScope(messageFormat: string, ...args: unknown[]): Disposable | undefined;
}

declare module '@rhombus-std/logging.core' {
  interface ILogger<TCategoryName = unknown> extends ILoggerAugmentations {}
}

/**
 * Registered against the `ILogger` token below and reachable standalone as
 * `LoggerAugmentations.logInformation(logger, ...)`; a concrete logger class
 * decorated with `@augment(typefor<ILogger>())` gains the members as methods.
 */
export const LoggerAugmentations: AugmentationSet2<ILogger, Flatten<ILoggerAugmentations & ILoggerStandaloneWrappers>> =
  { log, beginScope, logTrace, logDebug, logInformation, logWarning, logError, logCritical };

// `log` and `beginScope` share names with `ILogger`'s own primitives, so each
// is installed with a merge strategy (below) that routes a primitive-shaped
// call to the primitive and a convenience-shaped call to the wrapper. The
// wrapper re-enters the receiver in primitive shape (e.g.
// `log(logLevel, EventId.from(0), ...)`), so the dispatcher routes that call
// back to the primitive rather than recursing.
const loggerMerge = {
  // `log`: the primitive's second argument is always an `EventId`; the
  // convenience wrapper's is a message string (or a leading `Error`).
  log(original, incoming) {
    return function(this: ILogger, logLevel: LogLevel, second: unknown, ...rest: unknown[]) {
      if (second instanceof EventId) {
        return original.call(this, logLevel, second, ...rest);
      }
      return incoming(this, logLevel, second, ...rest);
    };
  },
  // `beginScope`: the convenience wrapper formats a message template with
  // args; the primitive takes an arbitrary state (which may itself be a bare
  // string). Route to the wrapper only for the unambiguous format form -- a
  // string WITH format args -- so a lone `beginScope("op-1")` stays raw
  // primitive state.
  beginScope(original, incoming) {
    return function(this: ILogger, first: unknown, ...rest: unknown[]) {
      if (typeof first === 'string' && rest.length > 0) {
        return incoming(this, first, ...rest);
      }
      return original.call(this, first, ...rest);
    };
  },
} satisfies MergeStrategies;

registerAugmentations(typefor<ILogger>(), LoggerAugmentations, loggerMerge);
