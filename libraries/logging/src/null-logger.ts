// NullLogger / NullLoggerProvider / NullLoggerFactory — the no-op logging
// family, ported from ME.Logging.Abstractions' `NullLogger*`. These are fully
// mechanical (they do nothing) and need no provider infrastructure, so they are
// implemented for real.

import type {
  EventId,
  ILogger,
  ILoggerFactory,
  ILoggerProvider,
  LoggerExtensionMethods,
  LogLevel,
} from "@rhombus-std/logging.core";
import { augment } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { Func } from "@rhombus-toolkit/func";

/** A `Disposable` that does nothing on dispose — the shared no-op scope token. */
const NULL_SCOPE: Disposable = { [Symbol.dispose]() {} };

// Class-side type merge for the registry-installed `LoggerExtensions` methods
// — see ./logger.ts; same §36 reasoning (no ILogger interface merge).
export interface NullLogger extends LoggerExtensionMethods {}

/** A minimalistic {@link ILogger} that does nothing. */
@augment(nameof<ILogger>())
export class NullLogger implements ILogger {
  /** The shared no-op logger instance. */
  public static readonly instance: NullLogger = new NullLogger();

  private constructor() {}

  public log<TState>(
    _logLevel: LogLevel,
    _eventId: EventId,
    _state: TState,
    _error: Error | undefined,
    _formatter: Func<[TState, Error | undefined], string>,
  ): void {}

  public isEnabled(_logLevel: LogLevel): boolean {
    return false;
  }

  public beginScope<TState>(_state: TState): Disposable {
    return NULL_SCOPE;
  }
}

/** An {@link ILoggerProvider} whose loggers do nothing. */
export class NullLoggerProvider implements ILoggerProvider {
  /** The shared no-op provider instance. */
  public static readonly instance: NullLoggerProvider = new NullLoggerProvider();

  private constructor() {}

  public createLogger(_categoryName: string): ILogger {
    return NullLogger.instance;
  }

  public [Symbol.dispose](): void {}
}

/** An {@link ILoggerFactory} that creates {@link NullLogger} instances. */
export class NullLoggerFactory implements ILoggerFactory {
  /** The shared no-op factory instance. */
  public static readonly instance: NullLoggerFactory = new NullLoggerFactory();

  public constructor() {}

  public createLogger(_categoryName: string): ILogger {
    return NullLogger.instance;
  }

  public addProvider(_provider: ILoggerProvider): void {}

  public [Symbol.dispose](): void {}
}
