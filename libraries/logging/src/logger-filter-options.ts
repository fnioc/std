// LoggerFilterOptions / LoggerFilterRule — the filter configuration data
// classes, ported from ME.Logging's `LoggerFilterOptions` / `LoggerFilterRule`.
//
// These are pure data holders and are implemented for real. What is NOT wired
// this pass is their CONSUMPTION: the reference `Logger` selects the most-
// specific rule per (provider, category) to compute each sink's enabled state.
// That selection runs inside the filter-options-monitor DI integration which is
// deferred (see ./logger.ts and ./logger-factory.ts). A caller can still build
// and inspect rules; `addFilter` (./filter-augmentations) appends them.

import { LogLevel } from "@rhombus-std/logging.core";
import type { Func } from "@rhombus-toolkit/func";

/**
 * A rule used to filter log messages. `filter` receives
 * `(providerName, categoryName, level)` and returns whether to log.
 */
export class LoggerFilterRule {
  /** The logger provider type or alias this rule applies to. */
  public readonly providerName: string | undefined;
  /** The logger category this rule applies to. */
  public readonly categoryName: string | undefined;
  /** The minimum {@link LogLevel} of messages this rule matches. */
  public readonly logLevel: LogLevel | undefined;
  /** The filter delegate applied to messages that pass the {@link LogLevel}. */
  public readonly filter: Func<[string | undefined, string | undefined, LogLevel], boolean> | undefined;

  public constructor(
    providerName: string | undefined,
    categoryName: string | undefined,
    logLevel: LogLevel | undefined,
    filter: Func<[string | undefined, string | undefined, LogLevel], boolean> | undefined,
  ) {
    this.providerName = providerName;
    this.categoryName = categoryName;
    this.logLevel = logLevel;
    this.filter = filter;
  }

  public toString(): string {
    return `providerName: '${this.providerName}', categoryName: '${this.categoryName}', `
      + `logLevel: '${this.logLevel}', filter: '${this.filter}'`;
  }
}

/** The options for a logger filter. */
export class LoggerFilterOptions {
  /** Whether logging scopes are captured. Defaults to `true`. */
  public captureScopes = true;

  /** The minimum level of log messages if no rule matches. */
  public minLevel: LogLevel = LogLevel.Trace;

  /** The collection of {@link LoggerFilterRule} used for filtering log messages. */
  public readonly rules: LoggerFilterRule[] = [];

  public constructor() {}
}
