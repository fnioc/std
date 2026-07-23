// A no-op ILogger, used when MemoryCache is constructed without a logger
// factory. The reference runtime pulls `NullLoggerFactory.Instance` from
// ME.Logging.Abstractions; @rhombus-std/logging.core does not (yet) export a
// null logger (issue #75 scope), so this package ships a private one. It is an
// internal implementation detail -- not part of the published barrel.

import type { EventId, ILogger, LogLevel } from '@rhombus-std/logging.core';
import { augment } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

// Binds the `ILogger` interface symbol onto the class so the interface-merged
// wrapper methods (logInformation/…, §80) flow onto it. Not exported, mirroring
// the class. `@augment(tokenfor<ILogger>())` installs the method form on the
// prototype whenever the ILogger bag registers.
interface NullLoggerImpl extends ILogger {}

/** A logger that discards every message and reports every level disabled. */
@augment(tokenfor<ILogger>())
class NullLoggerImpl implements ILogger {
  public log<TState>(
    _logLevel: LogLevel,
    _eventId: EventId,
    _state: TState,
    _error: Error | undefined,
    _formatter: Func<[TState, Error | undefined], string>,
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
