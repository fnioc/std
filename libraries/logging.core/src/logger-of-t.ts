// Logger<T> — delegates to an inner `ILogger` created by the injected
// `ILoggerFactory`, categorized by `T`.
//
// `T` is erased at runtime, so the engine supplies the closing type itself as a constructor
// arg (see `@rhombus-std/logging`'s `addLogging`), and the category is its name.

import { augment, type NamedType } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/types';
import type { EventId } from './EventId';
import type { ILogger } from './ILogger';
import type { ILoggerFactory } from './logger-factory';
import type { LogLevel } from './LogLevel';

// Binds the `ILogger` interface symbol onto the class so the interface-merged
// wrapper methods (logInformation/…) flow onto `Logger<T>`, present and
// future, beside the `@augment(typefor<ILogger>())` install below.
export interface Logger<T> extends ILogger<T> {}

/**
 * Delegates to an {@link ILogger} named for `T`, created by the provided
 * {@link ILoggerFactory}. Injected as `ILogger<T>` so a service gets a logger
 * categorized by its own type without spelling the category string.
 */
@augment(typefor<ILogger>())
export class Logger<T> implements ILogger<T> {
  readonly #logger: ILogger;

  public constructor(factory: ILoggerFactory, categoryType: NamedType) {
    this.#logger = factory.createLogger(categoryType.name);
  }

  public log<TState>(logLevel: LogLevel, eventId: EventId, state: TState, error: Error | undefined, formatter: Func<[TState, Error | undefined], string>): void {
    this.#logger.log(logLevel, eventId, state, error, formatter);
  }

  public isEnabled(logLevel: LogLevel): boolean {
    return this.#logger.isEnabled(logLevel);
  }

  public beginScope<TState>(state: TState): Disposable | undefined {
    return this.#logger.beginScope(state);
  }
}
