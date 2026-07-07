// addFilter — appends a LoggerFilterRule to a LoggerFilterOptions, ported from
// the `LoggerFilterOptions`-targeting overloads of ME.Logging's
// `FilterLoggingBuilderExtensions.AddFilter`.
//
// These operate directly on the options object (a plain exported function taking
// it as the first param — the repo's "explicit form is primary" convention) and
// are fully mechanical, so they are implemented for real. The reference exposes
// a wider overload matrix (provider-scoped `<T>` variants, per-category function
// filters); this ports the two unambiguous shapes — a `(category, level)` rule
// and a raw `(provider, category, level) => bool` filter. The remaining overloads
// are a deferred refinement (noted in the README); they add no capability, only
// argument-shape sugar over the same `rules.push(new LoggerFilterRule(...))`.
//
// NOTE: rules are not yet CONSUMED — the filter-selection layer is deferred with
// the options-monitor DI integration (see ./logger.ts). This builds the rule set.

import type { LogLevel } from "@rhombus-std/logging.core";
import type { Func } from "@rhombus-toolkit/func";
import { LoggerFilterOptions, LoggerFilterRule } from "./logger-filter-options";

/** Adds a `(category, level)` filter rule. */
export function addFilter(
  options: LoggerFilterOptions,
  category: string | undefined,
  level: LogLevel,
): LoggerFilterOptions;
/** Adds a raw `(providerName, categoryName, level) => boolean` filter rule. */
export function addFilter(
  options: LoggerFilterOptions,
  filter: Func<[string | undefined, string | undefined, LogLevel], boolean>,
): LoggerFilterOptions;
export function addFilter(
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
