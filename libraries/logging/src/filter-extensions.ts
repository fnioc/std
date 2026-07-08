// addFilter — appends a LoggerFilterRule to a LoggerFilterOptions, ported from
// the `LoggerFilterOptions`-targeting overloads of ME.Logging's
// `FilterLoggingBuilderExtensions.AddFilter`.
//
// The receiver is the value-object `LoggerFilterOptions`, so per docs §28 this is
// authored as the named `LoggerFilterOptionsExtensions` object literal. The install
// onto `LoggerFilterOptions.prototype` lives in ./filter-augmentations (#105 resolved
// the deferred boundary call in favour of giving options-bag receivers the method
// form, matching ME, which ships `AddFilter` as a `this LoggerFilterOptions` extension
// method). The member IS the standalone call surface. The reference exposes a wider
// overload matrix (provider-scoped `<T>` variants, per-category function filters); this
// ports the two unambiguous shapes — a `(category, level)` rule and a raw
// `(provider, category, level) => bool` filter. The remaining overloads are a deferred
// refinement; they add no capability, only argument-shape sugar over the same
// `rules.push(new LoggerFilterRule(...))`.
//
// NOTE: rules are not yet CONSUMED — the filter-selection layer is deferred with
// the options-monitor DI integration (see ./logger.ts). This builds the rule set.

import type { LogLevel } from "@rhombus-std/logging.core";
import type { AugmentationSet } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";
import { LoggerFilterOptions, LoggerFilterRule } from "./logger-filter-options";

/** Adds a `(category, level)` filter rule. */
function addFilter(
  options: LoggerFilterOptions,
  category: string | undefined,
  level: LogLevel,
): LoggerFilterOptions;
/** Adds a raw `(providerName, categoryName, level) => boolean` filter rule. */
function addFilter(
  options: LoggerFilterOptions,
  filter: Func<[string | undefined, string | undefined, LogLevel], boolean>,
): LoggerFilterOptions;
function addFilter(
  options: LoggerFilterOptions,
  categoryOrFilter: string | undefined | Func<[string | undefined, string | undefined, LogLevel], boolean>,
  level?: LogLevel,
): LoggerFilterOptions {
  if (typeof categoryOrFilter === "function") {
    options.rules.push(new LoggerFilterRule(undefined, undefined, undefined, categoryOrFilter));
  } else {
    options.rules.push(new LoggerFilterRule(undefined, categoryOrFilter, level, undefined));
  }
  return options;
}

/**
 * The `LoggerFilterOptions`-targeted `addFilter` (docs §28). Installed onto the
 * `LoggerFilterOptions` prototype in ./filter-augmentations, and reachable here as
 * the standalone `LoggerFilterOptionsExtensions.addFilter(options, …)`. Named
 * `LoggerFilterOptionsExtensions` because the ME class name
 * `FilterLoggingBuilderExtensions` is claimed by the ILoggingBuilder-receiver
 * overloads and ME provides no distinct name for the value-object side.
 */
export const LoggerFilterOptionsExtensions = {
  addFilter,
} satisfies AugmentationSet<LoggerFilterOptions>;
