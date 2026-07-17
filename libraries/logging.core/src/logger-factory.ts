// The factory/provider contracts, ported from ME.Logging.Abstractions'
// `ILoggerFactory` / `ILoggerProvider`.

import type { ILogger } from './ILogger';

/**
 * Creates {@link ILogger} instances. A `ILoggerProvider` is one sink family
 * (console, debug, …); the reference runtime keeps each concrete provider in
 * its own package, all of which are OUT OF SCOPE this pass (see issue #75).
 * The contract is ported so a consumer can supply their own provider to
 * `LoggerFactory`.
 *
 * Extends `Disposable` (the repo's `ESNext.Disposable` convention) in place of
 * the reference `IDisposable`.
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
