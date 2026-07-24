// Internal structured log messages for the host runtime. Not exported from
// the package barrel; call sites use `HostingLoggerExtensions.member(logger,
// ...)` directly.
//
// Written against `ILogger.log` directly (rather than the `logInformation`-
// style convenience wrappers) so each message keeps its stable event id.

import { type EventId, formatLogValues, FormattedLogValues, type ILogger, LogLevel } from '@rhombus-std/logging.core';
import type { AugmentationSet } from '@rhombus-std/primitives';
import { LoggerEventIds } from './LoggerEventIds';

/** Coerces an arbitrary thrown value into an `Error` for the logging sink. */
function toError(value: unknown): Error | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value instanceof Error ? value : new Error(String(value));
}

/** Writes a fixed message at `level`/`eventId`. */
function write(logger: ILogger, level: LogLevel, eventId: EventId, message: string, error?: unknown): void {
  if (!logger.isEnabled(level)) {
    return;
  }
  logger.log(level, eventId, new FormattedLogValues(message, []), toError(error), formatLogValues);
}

/**
 * The internal `HostingLoggerExtensions` set -- the host runtime's structured
 * log messages, keyed to {@link LoggerEventIds}.
 */
export const HostingLoggerExtensions = {
  /**
   * Logs an application-lifecycle callback error at critical severity. When
   * `error` is an `AggregateError`, each inner error's message is appended to
   * the log message. Unlike the other members here, this write is not
   * `isEnabled`-guarded.
   */
  applicationError(logger: ILogger, eventId: EventId, message: string, error: unknown): void {
    let text = message;
    const coerced = toError(error);
    if (coerced instanceof AggregateError) {
      for (const inner of coerced.errors as unknown[]) {
        if (inner !== undefined && inner !== null) {
          text = `${text}\n${inner instanceof Error ? inner.message : String(inner)}`;
        }
      }
    }
    logger.log(LogLevel.Critical, eventId, new FormattedLogValues(text, []), coerced, formatLogValues);
  },
  starting(logger: ILogger): void {
    write(logger, LogLevel.Debug, LoggerEventIds.starting, 'Hosting starting');
  },
  started(logger: ILogger): void {
    write(logger, LogLevel.Debug, LoggerEventIds.started, 'Hosting started');
  },
  stopping(logger: ILogger): void {
    write(logger, LogLevel.Debug, LoggerEventIds.stopping, 'Hosting stopping');
  },
  stopped(logger: ILogger): void {
    write(logger, LogLevel.Debug, LoggerEventIds.stopped, 'Hosting stopped');
  },
  stoppedWithError(logger: ILogger, error: unknown): void {
    write(logger, LogLevel.Debug, LoggerEventIds.stoppedWithError, 'Hosting shutdown error', error);
  },
  backgroundServiceFaulted(logger: ILogger, error: unknown): void {
    write(logger, LogLevel.Error, LoggerEventIds.backgroundServiceFaulted, 'BackgroundService failed', error);
  },
  backgroundServiceStoppingHost(logger: ILogger, error: unknown): void {
    write(logger, LogLevel.Critical, LoggerEventIds.backgroundServiceStoppingHost,
      'A BackgroundService has thrown an unhandled error, and the host is stopping.', error);
  },
  hostedServiceStartupFaulted(logger: ILogger, error: unknown): void {
    write(logger, LogLevel.Error, LoggerEventIds.hostedServiceStartupFaulted, 'Hosting failed to start', error);
  },
} satisfies AugmentationSet<ILogger>;
