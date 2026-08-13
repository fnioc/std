// A no-op ILogger, used when MemoryCache is constructed without a logger
// factory. `@rhombus-std/logging.core` doesn't export a null logger yet, so
// this package ships a private one -- an internal implementation detail, not
// part of the published barrel.

import type { EventId, ILogger, LogLevel } from '@rhombus-std/logging.core';
import { augment } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

// Binds the `ILogger` interface symbol onto the class so the interface-merged
// wrapper methods (logInformation/…) flow onto it. Not exported, matching the
// class. `@augment(typefor<ILogger>())` installs the method form on the
// prototype whenever the ILogger bag registers.
interface NullLoggerImpl extends ILogger {}

/** A logger that discards every message and reports every level disabled. */
@augment(typefor<ILogger>())
class NullLoggerImpl implements ILogger {
  public log<TState>(_logLevel: LogLevel, _eventId: EventId, _state: TState, _error: Error | undefined,
    _formatter: Func<[TState, Error | undefined], string>): void {
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
