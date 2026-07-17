// LoggerFilterConfigureOptions, ported from the reference logging
// configuration project's internal `LoggerFilterConfigureOptions`
// (`Configure` / `LoadDefaultConfigValues` / `LoadRules` / `TryGetSwitch`).
//
// A LAZY configure step (a `IConfigureOptions<LoggerFilterOptions>` pipeline
// participant): nothing is read until the `IOptions<LoggerFilterOptions>`
// assembly materializes the value, and every re-run (a configuration reload)
// re-walks the tree. Expected shape:
//
//   {
//     "CaptureScopes": "true",
//     "LogLevel":  { "Default": "Information", "MyApp": "Debug" },   // global
//     "Console":   { "LogLevel": { "Default": "Warning" } }          // per-provider
//   }
//
// A top-level "LogLevel" section produces provider-agnostic rules (provider =
// undefined); any other top-level section's nested "LogLevel" produces rules
// scoped to that provider (its key). A category of "Default" maps to the
// catch-all rule (category = undefined).

import type { IConfig } from '@rhombus-std/config.core';
import { LoggerFilterOptions, LoggerFilterRule } from '@rhombus-std/logging';
import { LogLevel } from '@rhombus-std/logging.core';
import type { IConfigureOptions } from '@rhombus-std/options';

const LOG_LEVEL_KEY = 'loglevel';
const DEFAULT_CATEGORY = 'default';

const LEVEL_BY_NAME: Record<string, LogLevel> = {
  trace: LogLevel.Trace,
  debug: LogLevel.Debug,
  information: LogLevel.Information,
  warning: LogLevel.Warning,
  error: LogLevel.Error,
  critical: LogLevel.Critical,
  none: LogLevel.None,
};

/**
 * Parses a configured level value (a level name, case-insensitive, or its
 * numeric ordinal). Throws on a non-empty unrecognized value, mirroring the
 * reference `TryGetSwitch`.
 */
export function parseLogLevel(value: string): LogLevel {
  const named = LEVEL_BY_NAME[value.trim().toLowerCase()];
  if (named !== undefined) {
    return named;
  }
  const ordinal = Number(value.trim());
  if (Number.isInteger(ordinal) && ordinal >= LogLevel.Trace && ordinal <= LogLevel.None) {
    return ordinal as LogLevel;
  }
  throw new Error(`The log level value '${value}' is not supported.`);
}

function loadRules(
  options: LoggerFilterOptions,
  levelSection: IConfig,
  provider: string | undefined,
): void {
  for (const entry of levelSection.getChildren()) {
    const value = entry.value;
    if (value === undefined || value === '') {
      continue;
    }
    const level = parseLogLevel(value);
    const category = entry.key.toLowerCase() === DEFAULT_CATEGORY ? undefined : entry.key;
    options.rules.push(new LoggerFilterRule(provider, category, level, undefined));
  }
}

/**
 * The configure step binding `LoggerFilterOptions` from an
 * {@link IConfig} — sets `captureScopes` and appends a
 * {@link LoggerFilterRule} for every `LogLevel` entry (global and
 * per-provider). Registered by `addConfig` as one configure source in
 * the options pipeline.
 */
export class LoggerFilterConfigureOptions implements IConfigureOptions<LoggerFilterOptions> {
  readonly #config: IConfig;

  /** @param config The configuration walked on every {@link configure}. */
  public constructor(config: IConfig) {
    this.#config = config;
  }

  /** Populates `options` from the configuration, mutating it in place. */
  public configure(options: LoggerFilterOptions): void {
    options.captureScopes = this.#config.getBool('CaptureScopes', options.captureScopes);

    for (const section of this.#config.getChildren()) {
      if (section.key.toLowerCase() === LOG_LEVEL_KEY) {
        // Global category defaults.
        loadRules(options, section, undefined);
      } else {
        // Provider-specific rules under `<provider>:LogLevel`. A missing
        // section is an empty IConfig (never null), so this is a safe
        // no-op.
        loadRules(options, section.getSection('LogLevel'), section.key);
      }
    }
  }
}
