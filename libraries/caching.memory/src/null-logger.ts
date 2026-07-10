// A no-op ILogger, used when MemoryCache is constructed without a logger
// factory. The reference runtime pulls `NullLoggerFactory.Instance` from
// ME.Logging.Abstractions; @rhombus-std/logging.core does not (yet) export a
// null logger (issue #75 scope), so this package ships a private one. It is an
// internal implementation detail -- not part of the published barrel.

import type { EventId, ILogger, LoggerExtensionMethods, LogLevel } from "@rhombus-std/logging.core";
import { augment } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { Func } from "@rhombus-toolkit/func";

// Class-side type merge for the registry-installed `LoggerExtensions` methods —
// same §36 reasoning as @rhombus-std/logging's NullLogger (no ILogger interface
// merge). Not exported, mirroring the class. `@augment(nameof<ILogger>())`
// installs the method form on the prototype whenever the ILogger bag registers.
interface NullLoggerImpl extends LoggerExtensionMethods {}

/** A logger that discards every message and reports every level disabled. */
@augment(nameof<ILogger>())
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
