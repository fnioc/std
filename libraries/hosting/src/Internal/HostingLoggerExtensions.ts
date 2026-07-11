// Internal structured log messages for the host runtime -- port of the
// reference hosting runtime's internal `HostingLoggerExtensions` static class.
//
// Authored in the §28/§42 object-literal shape (one const per reference static
// class, receiver-first members, `satisfies AugmentationSet<ILogger>`), but the
// reference class is INTERNAL, so the const stays module-scoped: it is not
// exported from the package barrel and there is no registry/prototype install.
// Call sites use `HostingLoggerExtensions.member(logger, ...)` directly.
//
// Written against `ILogger.log` directly (rather than the `logInformation`-style
// convenience wrappers) so each message keeps its stable event id, mirroring the
// reference. A disabled sink never pays the formatting cost -- `write` guards on
// `isEnabled` first, exactly as the reference helpers do. The one exception is
// `applicationError`, which the reference leaves unguarded; it is unguarded here
// too.

import { type EventId, formatLogValues, FormattedLogValues, type ILogger, LogLevel } from "@rhombus-std/logging.core";
import type { AugmentationSet } from "@rhombus-std/primitives";
import { LoggerEventIds } from "./LoggerEventIds";

/** Coerces an arbitrary thrown value into an `Error` for the logging sink. */
function toError(value: unknown): Error | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value instanceof Error ? value : new Error(String(value));
}

/** Writes a fixed message at `level`/`eventId`, guarding on `isEnabled` first. */
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
   * Logs an application-lifecycle callback error at critical severity. The
   * reference appends each inner loader-exception message when the exception is
   * a reflection type-load failure; the analog here is an `AggregateError`,
   * whose inner error messages are appended the same way. Unlike the other
   * members, the reference does not `isEnabled`-guard this write.
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
    write(logger, LogLevel.Debug, LoggerEventIds.starting, "Hosting starting");
  },
  started(logger: ILogger): void {
    write(logger, LogLevel.Debug, LoggerEventIds.started, "Hosting started");
  },
  stopping(logger: ILogger): void {
    write(logger, LogLevel.Debug, LoggerEventIds.stopping, "Hosting stopping");
  },
  stopped(logger: ILogger): void {
    write(logger, LogLevel.Debug, LoggerEventIds.stopped, "Hosting stopped");
  },
  stoppedWithException(logger: ILogger, error: unknown): void {
    write(logger, LogLevel.Debug, LoggerEventIds.stoppedWithException, "Hosting shutdown exception", error);
  },
  backgroundServiceFaulted(logger: ILogger, error: unknown): void {
    write(logger, LogLevel.Error, LoggerEventIds.backgroundServiceFaulted, "BackgroundService failed", error);
  },
  backgroundServiceStoppingHost(logger: ILogger, error: unknown): void {
    write(
      logger,
      LogLevel.Critical,
      LoggerEventIds.backgroundServiceStoppingHost,
      "A BackgroundService has thrown an unhandled exception, and the host is stopping.",
      error,
    );
  },
  hostedServiceStartupFaulted(logger: ILogger, error: unknown): void {
    write(logger, LogLevel.Error, LoggerEventIds.hostedServiceStartupFaulted, "Hosting failed to start", error);
  },
} satisfies AugmentationSet<ILogger>;
