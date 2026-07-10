// addFilter — appends a LoggerFilterRule to a LoggerFilterOptions, ported from
// the `LoggerFilterOptions`-targeting overloads of ME.Logging's
// `FilterLoggingBuilderExtensions.AddFilter`.
//
// This is a CLOSED set: the receiver value-object `LoggerFilterOptions` and its
// only augmentation both live in THIS package, so it keeps the direct
// `applyAugmentations` install at the concrete class — no token, no registry
// (docs §38). Authored as the named `LoggerFilterOptionsExtensions` object literal
// (docs §28); the member IS the standalone call surface.
//
// #105 resolved the deferred boundary call in favour of giving options-bag
// receivers the method form: ME ships `AddFilter` as a `this LoggerFilterOptions`
// extension method (in FilterLoggingBuilderExtensions, alongside the ILoggingBuilder
// overloads), so the receiver reads `options.addFilter(...)` just like every other
// dual-export member. The reference exposes a wider overload matrix (provider-scoped
// `<T>` variants, per-category function filters); this ports the two unambiguous
// shapes — a `(category, level)` rule and a raw `(provider, category, level) => bool`
// filter. The remaining overloads are a deferred refinement; they add no capability,
// only argument-shape sugar over the same `rules.push(new LoggerFilterRule(...))`.
//
// RECORDED SPLIT (no code yet): the unported `ILoggingBuilder` half of ME's
// `FilterLoggingBuilderExtensions` must land as a SEPARATE const named
// `FilterLoggingBuilderExtensions` targeting the `ILoggingBuilder` token
// (`nameof<ILoggingBuilder>()`; single-receiver split rule) — never folded into
// `LoggerFilterOptionsExtensions`.
//
// NOTE: rules are not yet CONSUMED — the filter-selection layer is deferred with
// the options-monitor DI integration (see ./logger.ts). This builds the rule set.

import type { LogLevel } from "@rhombus-std/logging.core";
import { applyAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";
import { LoggerFilterOptions, LoggerFilterRule } from "./logger-filter-options";

/**
 * The `LoggerFilterOptions`-targeted `addFilter` (docs §28). Installed onto the
 * `LoggerFilterOptions` prototype below (CLOSED — direct `applyAugmentations`), and
 * reachable as the standalone `LoggerFilterOptionsExtensions.addFilter(options, …)`.
 * Named `LoggerFilterOptionsExtensions` because the ME class name
 * `FilterLoggingBuilderExtensions` is claimed by the ILoggingBuilder-receiver
 * overloads and ME provides no distinct name for the value-object side.
 */
export const LoggerFilterOptionsExtensions = {
  /** Adds a `(category, level)` rule, or a raw `(providerName, categoryName, level) => boolean` filter. */
  addFilter(
    options: LoggerFilterOptions,
    ...rest:
      | [category: string | undefined, level: LogLevel]
      | [filter: Func<[string | undefined, string | undefined, LogLevel], boolean>]
  ): LoggerFilterOptions {
    const [categoryOrFilter, level] = rest;
    if (typeof categoryOrFilter === "function") {
      options.rules.push(new LoggerFilterRule(undefined, undefined, undefined, categoryOrFilter));
    } else {
      options.rules.push(new LoggerFilterRule(undefined, categoryOrFilter, level, undefined));
    }
    return options;
  },
} satisfies AugmentationSet<LoggerFilterOptions>;

declare module "./logger-filter-options" {
  interface LoggerFilterOptions {
    addFilter(category: string | undefined, level: LogLevel): this;
    addFilter(filter: Func<[string | undefined, string | undefined, LogLevel], boolean>): this;
  }
}

applyAugmentations(LoggerFilterOptions, LoggerFilterOptionsExtensions);
