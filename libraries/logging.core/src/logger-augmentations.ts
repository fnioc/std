// The convenience logging wrappers, ported from ME.Logging.Abstractions'
// static `LoggerExtensions` class (`LogTrace`/`LogDebug`/`LogInformation`/
// `LogWarning`/`LogError`/`LogCritical` + the level-parameterized `Log`).
//
// Dual export (docs §28/§38): the receiver-first functions are exported plain
// (the standalone surface), grouped into the `LoggerExtensions` set and
// registered against the `ILogger` token so every concrete logger decorated
// with `@augment(nameof<ILogger>())` gains the method form. The method surface
// is merged onto `ILogger` itself via the `declare module './logger'` block
// below — the §36/§48 many-implementers carve-out is retired (§80): every
// receiver, `ILogger` included, uses the standard declare-module interface
// merge, and each concrete class `extends ILogger` beside its `@augment`.
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

import { type AugmentationSet, type MergeStrategies, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives.transformer/internal/nameof';
import { EventId } from './event-id';
import { formatLogValues, FormattedLogValues } from './formatted-log-values';
import type { ILogger } from './logger';
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

/**
 * Formats a message template and begins a logical operation scope on `logger` —
 * the `LoggerExtensions.BeginScope(messageFormat, …args)` analog. Returns the
 * scope `Disposable` (dispose to end the scope), or `undefined` when the logger
 * does not support scopes.
 */
export function beginScope(logger: ILogger, messageFormat: string, ...args: unknown[]): Disposable | undefined {
  return logger.beginScope(new FormattedLogValues(messageFormat, args));
}

/**
 * The `LoggerExtensions` augmentation set for {@link ILogger} (docs §28/§38).
 * Registered against the `ILogger` token below and reachable standalone as
 * `LoggerExtensions.logInformation(logger, …)`; a concrete logger class
 * decorated with `@augment(nameof<ILogger>())` gains the members as methods.
 */
export const LoggerExtensions = {
  log,
  beginScope,
  logTrace,
  logDebug,
  logInformation,
  logWarning,
  logError,
  logCritical,
} satisfies AugmentationSet<ILogger>;

// The method-form surface merged onto {@link ILogger} (docs §28/§38): the merge
// types the wrappers on the interface itself, so every `ILogger` value carries
// them and each concrete logger class `extends ILogger` beside its
// `@augment(nameof<ILogger>())` decoration to declare them where they install.
//
// `log` and `beginScope` are absent from THIS interface merge — their names ARE
// `ILogger`'s own primitives, and TS forbids merging an incompatible convenience
// overload onto a body-declared primitive method (TS2430). They are NOT excluded
// at runtime: the registration below installs them with a merge strategy that
// dispatches the primitive-shaped call to the primitive and the convenience-shaped
// call to the wrapper (see `loggerMerge`), so the convenience form stays
// dot-callable. Their typed path stays the standalone `log(logger, …)` /
// `beginScope(logger, …)` functions.
declare module './logger' {
  interface ILogger<TCategoryName = unknown> {
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
}

// The wrappers `log` and `beginScope` share their names with `ILogger`'s own
// primitives (`log(logLevel, eventId, state, error, formatter)` and
// `beginScope(state)`). Rather than exclude them, the full set is registered
// with a merge strategy per colliding member: at install the registry mounts a
// DISPATCHER over each primitive that routes the primitive-shaped call to the
// primitive and the convenience-shaped call to the wrapper. Because the wrapper
// re-enters the receiver in primitive shape (`log(logLevel, EventId.from(0), …)`,
// `beginScope(new FormattedLogValues(…))`), the dispatcher routes those back to
// the primitive — so the convenience form is dot-callable without recursing.
const loggerMerge = {
  // `log`: the primitive's second argument is always an `EventId`; the
  // convenience wrapper's is a message string (or a leading `Error`).
  log(original, extension) {
    return function(this: ILogger, logLevel: LogLevel, second: unknown, ...rest: unknown[]) {
      if (second instanceof EventId) {
        return original.call(this, logLevel, second, ...rest);
      }
      return extension(this, logLevel, second, ...rest);
    };
  },
  // `beginScope`: the convenience wrapper formats a message template with args;
  // the primitive takes an arbitrary state (which may itself be a bare string).
  // Route to the wrapper only for the unambiguous format form — a string WITH
  // format args — so a lone `beginScope("op-1")` stays raw primitive state, as
  // the reference's instance-method-wins overload resolution does.
  beginScope(original, extension) {
    return function(this: ILogger, first: unknown, ...rest: unknown[]) {
      if (typeof first === 'string' && rest.length > 0) {
        return extension(this, first, ...rest);
      }
      return original.call(this, first, ...rest);
    };
  },
} satisfies MergeStrategies;

registerAugmentations(nameof<ILogger>(), LoggerExtensions, loggerMerge);
