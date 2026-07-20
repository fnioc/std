// White-box tests for the internal `HostingLoggerExtensions` set (the host
// runtime's structured log messages) via the `internal/*` seam.

import { HostingLoggerExtensions } from '@rhombus-std/hosting/private/internal/HostingLoggerExtensions';
import { LoggerEventIds } from '@rhombus-std/hosting/private/internal/LoggerEventIds';
import { type EventId, type ILogger, LogLevel } from '@rhombus-std/logging.core';
import { expect, test } from 'bun:test';

interface Entry {
  level: LogLevel;
  eventId: EventId;
  message: string;
  error: Error | undefined;
}

/** A recording `ILogger` whose enablement is switchable per test. */
// Binds the augmented `ILogger` symbol onto the fake so the merged wrapper
// methods (logInformation/…, §80) are declared on it; never called here.
interface RecordingLogger extends ILogger {}
class RecordingLogger implements ILogger {
  public readonly entries: Entry[] = [];
  public enabled = true;

  public log<TState>(
    logLevel: LogLevel,
    eventId: EventId,
    state: TState,
    error: Error | undefined,
    formatter: (state: TState, error: Error | undefined) => string,
  ): void {
    this.entries.push({ level: logLevel, eventId, message: formatter(state, error), error });
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public beginScope(): Disposable | undefined {
    return undefined;
  }
}

test('each member writes its fixed message at the reference level and event id', () => {
  const error = new Error('boom');
  const cases: Array<[(logger: ILogger) => void, LogLevel, EventId, string, Error | undefined]> = [
    [
      (l) => HostingLoggerExtensions.starting(l),
      LogLevel.Debug,
      LoggerEventIds.starting,
      'Hosting starting',
      undefined,
    ],
    [(l) => HostingLoggerExtensions.started(l), LogLevel.Debug, LoggerEventIds.started, 'Hosting started', undefined],
    [
      (l) => HostingLoggerExtensions.stopping(l),
      LogLevel.Debug,
      LoggerEventIds.stopping,
      'Hosting stopping',
      undefined,
    ],
    [(l) => HostingLoggerExtensions.stopped(l), LogLevel.Debug, LoggerEventIds.stopped, 'Hosting stopped', undefined],
    [
      (l) => HostingLoggerExtensions.stoppedWithError(l, error),
      LogLevel.Debug,
      LoggerEventIds.stoppedWithError,
      'Hosting shutdown error',
      error,
    ],
    [
      (l) => HostingLoggerExtensions.backgroundServiceFaulted(l, error),
      LogLevel.Error,
      LoggerEventIds.backgroundServiceFaulted,
      'BackgroundService failed',
      error,
    ],
    [
      (l) => HostingLoggerExtensions.backgroundServiceStoppingHost(l, error),
      LogLevel.Critical,
      LoggerEventIds.backgroundServiceStoppingHost,
      'A BackgroundService has thrown an unhandled error, and the host is stopping.',
      error,
    ],
    [
      (l) => HostingLoggerExtensions.hostedServiceStartupFaulted(l, error),
      LogLevel.Error,
      LoggerEventIds.hostedServiceStartupFaulted,
      'Hosting failed to start',
      error,
    ],
  ];

  for (const [invoke, level, eventId, message, expectedError] of cases) {
    const logger = new RecordingLogger();
    invoke(logger);
    expect(logger.entries).toHaveLength(1);
    const entry = logger.entries[0]!;
    expect(entry.level).toBe(level);
    expect(entry.eventId.id).toBe(eventId.id);
    expect(entry.eventId.name).toBe(eventId.name);
    expect(entry.message).toBe(message);
    expect(entry.error).toBe(expectedError as Error);
  }
});

test('the fixed-message members guard on isEnabled and skip a disabled sink', () => {
  const logger = new RecordingLogger();
  logger.enabled = false;

  HostingLoggerExtensions.starting(logger);
  HostingLoggerExtensions.started(logger);
  HostingLoggerExtensions.stopping(logger);
  HostingLoggerExtensions.stopped(logger);
  HostingLoggerExtensions.stoppedWithError(logger, new Error('x'));
  HostingLoggerExtensions.backgroundServiceFaulted(logger, new Error('x'));
  HostingLoggerExtensions.backgroundServiceStoppingHost(logger, new Error('x'));
  HostingLoggerExtensions.hostedServiceStartupFaulted(logger, new Error('x'));

  expect(logger.entries).toHaveLength(0);
});

test("applicationError writes at critical severity with the caller's event id", () => {
  const logger = new RecordingLogger();
  const error = new Error('listener failed');

  HostingLoggerExtensions.applicationError(
    logger,
    LoggerEventIds.applicationStoppingError,
    'An error occurred stopping the application',
    error,
  );

  expect(logger.entries).toHaveLength(1);
  const entry = logger.entries[0]!;
  expect(entry.level).toBe(LogLevel.Critical);
  expect(entry.eventId.id).toBe(LoggerEventIds.applicationStoppingError.id);
  expect(entry.message).toBe('An error occurred stopping the application');
  expect(entry.error).toBe(error);
});

test('applicationError is unguarded — it writes even when the sink reports disabled', () => {
  const logger = new RecordingLogger();
  logger.enabled = false;

  HostingLoggerExtensions.applicationError(
    logger,
    LoggerEventIds.applicationStartupError,
    'startup',
    new Error('x'),
  );

  expect(logger.entries).toHaveLength(1);
});

test('applicationError appends each AggregateError inner message to the log message', () => {
  const logger = new RecordingLogger();
  const error = new AggregateError([new Error('first'), 'second', null], 'outer');

  HostingLoggerExtensions.applicationError(logger, LoggerEventIds.applicationStartupError, 'startup failed', error);

  expect(logger.entries).toHaveLength(1);
  expect(logger.entries[0]!.message).toBe('startup failed\nfirst\nsecond');
});

test('applicationError coerces a non-Error thrown value for the sink', () => {
  const logger = new RecordingLogger();

  HostingLoggerExtensions.applicationError(
    logger,
    LoggerEventIds.applicationStoppedError,
    'stopped',
    'plain string',
  );

  const entry = logger.entries[0]!;
  expect(entry.error).toBeInstanceOf(Error);
  expect(entry.error?.message).toBe('plain string');
});
