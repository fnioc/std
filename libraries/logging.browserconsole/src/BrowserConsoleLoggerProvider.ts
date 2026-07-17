// BrowserConsoleLoggerProvider — the ILoggerProvider producing
// BrowserConsoleLoggers. No options monitor, no formatter registry, no
// background queue (the browser console is synchronous and devtools do the
// styling); the provider is a category-keyed logger cache over one
// ConsoleLike.

import type { ILogger, ILoggerProvider } from '@rhombus-std/logging.core';
import { BrowserConsoleLogger } from './BrowserConsoleLogger';
import { console as globalConsole, type ConsoleLike } from './ConsoleLike';

/** An {@link ILoggerProvider} that creates {@link BrowserConsoleLogger}s. */
export class BrowserConsoleLoggerProvider implements ILoggerProvider {
  readonly #console: ConsoleLike;
  readonly #loggers = new Map<string, BrowserConsoleLogger>();

  /** @param console The console to write through; defaults to the platform global. */
  public constructor(console?: ConsoleLike) {
    this.#console = console ?? globalConsole;
  }

  /** Creates (or returns the cached) {@link BrowserConsoleLogger} for `name`. */
  public createLogger(name: string): ILogger {
    let logger = this.#loggers.get(name);
    if (logger === undefined) {
      logger = new BrowserConsoleLogger(name, this.#console);
      this.#loggers.set(name, logger);
    }
    return logger;
  }

  /** Nothing to release: the console is a borrowed global. */
  public [Symbol.dispose](): void {}
}
