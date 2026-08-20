// No options pipeline, no background queue: the browser console writes
// synchronously and devtools handle severity styling. This provider is a
// category-keyed logger cache over one ConsoleLike.

import type { ILogger, ILoggerProvider } from '@rhombus-std/logging.core';
import { BrowserConsoleLogger } from './BrowserConsoleLogger';
import { console as globalConsole, type ConsoleLike } from './ConsoleLike';

export class BrowserConsoleLoggerProvider implements ILoggerProvider {
  readonly #console: ConsoleLike;
  readonly #loggers = new Map<string, BrowserConsoleLogger>();

  /** @param console The console to write through; defaults to the platform global. */
  public constructor(console?: ConsoleLike) {
    this.#console = console ?? globalConsole;
  }

  /** Creates (or returns the cached) {@link BrowserConsoleLogger} for `name`. */
  public createLogger(name: string): ILogger {
    return this.#loggers.getOrInsertComputed(name, (name) => new BrowserConsoleLogger(name, this.#console));
  }

  /** Nothing to release: the console is a borrowed global. */
  public [Symbol.dispose](): void {}
}
