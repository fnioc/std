import type { LogLevel } from '@rhombus-std/logging.core';
import type { IConfigureOptions } from '@rhombus-std/options';
import type { LoggerFilterOptions } from './LoggerFilterOptions';

/** A configure step setting {@link LoggerFilterOptions.minLevel} to a fixed level. */
export class DefaultLoggerLevelConfigureOptions implements IConfigureOptions<LoggerFilterOptions> {
  readonly #level: LogLevel;

  public constructor(level: LogLevel) {
    this.#level = level;
  }

  public configure(options: LoggerFilterOptions): void {
    options.minLevel = this.#level;
  }
}
