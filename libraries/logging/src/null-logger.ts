// NullLogger / NullLoggerProvider / NullLoggerFactory — the no-op logging
// family. These are fully mechanical (they do nothing) and need no provider
// infrastructure, so they are implemented for real.

import type { EventId, ILogger, ILoggerFactory, ILoggerProvider, LogLevel } from '@rhombus-std/logging.core';
import { augment } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

/** A `Disposable` that does nothing on dispose — the shared no-op scope token. */
const NULL_SCOPE: Disposable = { [Symbol.dispose]() {} };

// Binds the `ILogger` interface onto the class so the interface-merged
// wrapper methods (logInformation/…) flow onto `NullLogger<T>`, beside the
// `@augment(tokenfor<ILogger>())` install below.
export interface NullLogger<T = unknown> extends ILogger<T> {}

/**
 * A minimalistic {@link ILogger} that does nothing.
 *
 * `ILogger<TCategoryName>`'s parameter is a phantom marker (see ./Logger.ts),
 * so the bare `NullLogger` (= `NullLogger<unknown>`) and any `NullLogger<T>`
 * are structurally identical. The shared {@link NullLogger.instance} singleton
 * stays typed `NullLogger<unknown>` (a static member cannot reference the
 * class type parameter) and, because `T` is phantom, is already assignable to
 * every `ILogger<T>` slot; `new NullLogger<Foo>()` hands a freshly-typed no-op
 * to callers that want one.
 */
@augment(tokenfor<ILogger>())
export class NullLogger<T = unknown> implements ILogger<T> {
  /** The shared no-op logger instance, typed `NullLogger<unknown>`. */
  public static readonly instance: NullLogger = new NullLogger();

  public constructor() {}

  public log<TState>(_logLevel: LogLevel, _eventId: EventId, _state: TState, _error: Error | undefined,
    _formatter: Func<[TState, Error | undefined], string>): void {}

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
// `@augment` installs the runtime `createLogger(type)` dispatcher — see
// ./LoggerFactory.ts; not visible in the static type.
@augment(tokenfor<ILoggerFactory>())
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
