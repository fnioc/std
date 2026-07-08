// Internal structured log messages for the host runtime -- port of the
// reference hosting runtime's `HostingLoggerExtensions` + `LoggerEventIds`.
//
// Written against `ILogger.log` directly (rather than the `logInformation`-style
// convenience wrappers) so each message keeps its stable event id, mirroring the
// reference. A disabled sink never pays the formatting cost -- `write` guards on
// `isEnabled` first, exactly as the reference helpers do.

import { EventId, FormattedLogValues, formatLogValues, LogLevel } from "@rhombus-std/logging.core";
import type { ILogger } from "@rhombus-std/logging.core";

/** The stable event ids the host runtime emits under. Mirrors the reference `LoggerEventIds`. */
export const LoggerEventIds = {
  starting: new EventId(1, "Starting"),
  started: new EventId(2, "Started"),
  stopping: new EventId(3, "Stopping"),
  stopped: new EventId(4, "Stopped"),
  stoppedWithException: new EventId(5, "StoppedWithException"),
  applicationStartupException: new EventId(6, "ApplicationStartupException"),
  applicationStoppingException: new EventId(7, "ApplicationStoppingException"),
  applicationStoppedException: new EventId(8, "ApplicationStoppedException"),
  backgroundServiceFaulted: new EventId(9, "BackgroundServiceFaulted"),
  backgroundServiceStoppingHost: new EventId(10, "BackgroundServiceStoppingHost"),
  hostedServiceStartupFaulted: new EventId(11, "HostedServiceStartupFaulted"),
} as const;

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

export function hostStarting(logger: ILogger): void {
  write(logger, LogLevel.Debug, LoggerEventIds.starting, "Hosting starting");
}

export function hostStarted(logger: ILogger): void {
  write(logger, LogLevel.Debug, LoggerEventIds.started, "Hosting started");
}

export function hostStopping(logger: ILogger): void {
  write(logger, LogLevel.Debug, LoggerEventIds.stopping, "Hosting stopping");
}

export function hostStopped(logger: ILogger): void {
  write(logger, LogLevel.Debug, LoggerEventIds.stopped, "Hosting stopped");
}

export function hostStoppedWithException(logger: ILogger, error: unknown): void {
  write(logger, LogLevel.Debug, LoggerEventIds.stoppedWithException, "Hosting shutdown exception", error);
}

export function backgroundServiceFaulted(logger: ILogger, error: unknown): void {
  write(logger, LogLevel.Error, LoggerEventIds.backgroundServiceFaulted, "BackgroundService failed", error);
}

export function backgroundServiceStoppingHost(logger: ILogger, error: unknown): void {
  write(
    logger,
    LogLevel.Critical,
    LoggerEventIds.backgroundServiceStoppingHost,
    "A BackgroundService has thrown an unhandled exception, and the host is stopping.",
    error,
  );
}

export function hostedServiceStartupFaulted(logger: ILogger, error: unknown): void {
  write(logger, LogLevel.Error, LoggerEventIds.hostedServiceStartupFaulted, "Hosting failed to start", error);
}

/** Logs an application-lifecycle callback error at critical severity. */
export function applicationError(logger: ILogger, eventId: EventId, message: string, error: unknown): void {
  write(logger, LogLevel.Critical, eventId, message, error);
}
