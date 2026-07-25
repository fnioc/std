// The factory/provider contracts.

import type { ILogger } from './ILogger';

/**
 * Creates {@link ILogger} instances for one sink family (console, debug, …).
 * Supply your own to a `LoggerFactory` to route log output somewhere new.
 */
export interface ILoggerProvider extends Disposable {
  /** Creates a new {@link ILogger} for the given category. */
  createLogger(categoryName: string): ILogger;
}

/**
 * Configures the logging system and creates {@link ILogger} instances from the
 * registered {@link ILoggerProvider}s.
 */
export interface ILoggerFactory extends Disposable {
  /** Creates a new {@link ILogger} for the given category. */
  createLogger(categoryName: string): ILogger;

  /** Adds an {@link ILoggerProvider} to the logging system. */
  addProvider(provider: ILoggerProvider): void;
}
