// DefaultLoggerLevelConfigureOptions — a configure step that sets the filter
// options' global minimum level, ported from ME.Logging's
// `DefaultLoggerLevelConfigureOptions` (a `ConfigureOptions<LoggerFilterOptions>`
// whose delegate is `options => options.MinLevel = level`).
//
// `addLogging` registers one at `LogLevel.Information` (the reference default);
// `setMinimumLevel` registers one at the caller's level. Both append it to the
// `LoggerFilterOptions` assembly's configure pipeline, so it composes with
// config-bound and `addFilter` steps in registration order.

import type { LogLevel } from "@rhombus-std/logging.core";
import type { ConfigureOptions } from "@rhombus-std/options";
import type { LoggerFilterOptions } from "./logger-filter-options";

/** A configure step setting {@link LoggerFilterOptions.minLevel} to a fixed level. */
export class DefaultLoggerLevelConfigureOptions implements ConfigureOptions<LoggerFilterOptions> {
  readonly #level: LogLevel;

  public constructor(level: LogLevel) {
    this.#level = level;
  }

  public configure(options: LoggerFilterOptions): void {
    options.minLevel = this.#level;
  }
}
