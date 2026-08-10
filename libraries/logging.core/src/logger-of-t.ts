// Logger<T> — delegates to an inner `ILogger` created by the injected
// `ILoggerFactory`, categorized by `T`.
//
// `T` is erased at runtime, so the di engine supplies the closing type's
// token as a `Typeof<T>` constructor parameter (see `@rhombus-std/logging`'s
// `addLogging`). The category is the token's type-name segment
// (`"@pkg/x:HomeController"` → `"HomeController"`).

import type { Typeof } from '@rhombus-std/di2.core';
import { augment } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import type { EventId } from './EventId';
import type { ILogger } from './ILogger';
import type { ILoggerFactory } from './logger-factory';
import type { LogLevel } from './LogLevel';

/** The category name carried by a di token — the segment after the first `:`. */
function categoryFromToken(token: string): string {
  const separator = token.indexOf(':');
  return separator === -1 ? token : token.slice(separator + 1);
}

// Binds the `ILogger` interface symbol onto the class so the interface-merged
// wrapper methods (logInformation/…) flow onto `Logger<T>`, present and
// future, beside the `@augment(tokenfor<ILogger>())` install below.
export interface Logger<T> extends ILogger<T> {}

/**
 * Delegates to an {@link ILogger} named for `T`, created by the provided
 * {@link ILoggerFactory}. Injected as `ILogger<T>` so a service gets a logger
 * categorized by its own type without spelling the category string.
 */
@augment(tokenfor<ILogger>())
export class Logger<T> implements ILogger<T> {
  readonly #logger: ILogger;

  public constructor(factory: ILoggerFactory, categoryType: Typeof<T>) {
    this.#logger = factory.createLogger(categoryFromToken(categoryType as unknown as string));
  }

  public log<TState>(logLevel: LogLevel, eventId: EventId, state: TState, error: Error | undefined,
    formatter: Func<[TState, Error | undefined], string>): void {
    this.#logger.log(logLevel, eventId, state, error, formatter);
  }

  public isEnabled(logLevel: LogLevel): boolean {
    return this.#logger.isEnabled(logLevel);
  }

  public beginScope<TState>(state: TState): Disposable | undefined {
    return this.#logger.beginScope(state);
  }
}
