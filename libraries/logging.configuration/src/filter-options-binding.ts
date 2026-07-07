// Real config-binding of LoggerFilterOptions from an IConfiguration, ported
// from ME.Logging.Configuration's internal `LoggerFilterConfigureOptions`
// (`LoadDefaultConfigValues` / `LoadRules` / `TryGetSwitch`).
//
// This is genuinely mechanical — a walk over the configuration tree building
// filter rules — so it is implemented for REAL. Expected shape:
//
//   {
//     "LogLevel":  { "Default": "Information", "MyApp": "Debug" },   // global
//     "Console":   { "LogLevel": { "Default": "Warning" } }          // per-provider
//   }
//
// A top-level "LogLevel" section produces provider-agnostic rules (provider =
// undefined); any other top-level section's nested "LogLevel" produces rules
// scoped to that provider (its key). A category of "Default" maps to the
// catch-all rule (category = undefined).

import type { IConfiguration } from "@rhombus-std/config.core";
import { LoggerFilterOptions, LoggerFilterRule } from "@rhombus-std/logging";
import { LogLevel } from "@rhombus-std/logging.core";

const LOG_LEVEL_KEY = "loglevel";
const DEFAULT_CATEGORY = "default";

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
  levelSection: IConfiguration,
  provider: string | undefined,
): void {
  for (const entry of levelSection.getChildren()) {
    const value = entry.value;
    if (value === undefined || value === "") {
      continue;
    }
    const level = parseLogLevel(value);
    const category = entry.key.toLowerCase() === DEFAULT_CATEGORY ? undefined : entry.key;
    options.rules.push(new LoggerFilterRule(provider, category, level, undefined));
  }
}

/**
 * Populates `options` from `configuration` — sets `captureScopes` and appends a
 * {@link LoggerFilterRule} for every `LogLevel` entry (global and per-provider).
 */
export function bindLoggerFilterOptions(configuration: IConfiguration, options: LoggerFilterOptions): void {
  options.captureScopes = configuration.getBool("CaptureScopes", options.captureScopes);

  for (const section of configuration.getChildren()) {
    if (section.key.toLowerCase() === LOG_LEVEL_KEY) {
      // Global category defaults.
      loadRules(options, section, undefined);
    } else {
      // Provider-specific rules under `<provider>:LogLevel`. A missing section
      // is an empty IConfiguration (never null), so this is a safe no-op.
      loadRules(options, section.getSection("LogLevel"), section.key);
    }
  }
}
