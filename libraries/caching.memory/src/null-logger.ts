// A no-op ILogger, used when MemoryCache is constructed without a logger
// factory. The reference runtime pulls `NullLoggerFactory.Instance` from
// ME.Logging.Abstractions; @rhombus-std/logging.core does not (yet) export a
// null logger (issue #75 scope), so this package ships a private one. It is an
// internal implementation detail -- not part of the published barrel.

import type { EventId, ILogger, LogLevel } from "@rhombus-std/logging.core";

/** A logger that discards every message and reports every level disabled. */
class NullLoggerImpl implements ILogger {
  public log<TState>(
    _logLevel: LogLevel,
    _eventId: EventId,
    _state: TState,
    _error: Error | undefined,
    _formatter: (state: TState, error: Error | undefined) => string,
  ): void {
    // discard
  }

  public isEnabled(_logLevel: LogLevel): boolean {
    return false;
  }

  public beginScope<TState>(_state: TState): Disposable | undefined {
    return undefined;
  }
}

/** The shared no-op logger instance. */
export const NullLogger: ILogger = new NullLoggerImpl();
