// addFilter — BOTH halves of ME.Logging's `FilterLoggingBuilderExtensions`:
// the `LoggerFilterOptions`-targeting overloads (appending a LoggerFilterRule
// directly) and the `ILoggingBuilder`-targeting overloads (routing through the
// options-configure pipeline).
//
// The options half is a CLOSED set: the receiver value-object
// `LoggerFilterOptions` and its only augmentation both live in THIS package, so
// it keeps the direct `applyAugmentations` install at the concrete class — no
// token, no registry (docs §38). Authored as the named
// `LoggerFilterOptionsExtensions` object literal (docs §28); the member IS the
// standalone call surface.
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
// The builder half honours the recorded single-receiver split rule: it is the
// SEPARATE `FilterLoggingBuilderExtensions` const targeting the `ILoggingBuilder`
// token (`nameof<ILoggingBuilder>()`) — never folded into
// `LoggerFilterOptionsExtensions`. As an OPEN-receiver set it installs through
// the augmentation registry (docs §38). Each builder overload routes through the
// shared `configureFilter` helper, mirroring the reference's
// `builder.Services.Configure<LoggerFilterOptions>(...)` bridge: a code
// configure step registered for the LOGGER_FILTER_OPTIONS_TOKEN options
// pipeline. It carries the same two overload shapes as the options half.
//
// NOTE: rules are not yet CONSUMED by the loggers — the filter-selection layer
// is deferred with the options-monitor DI integration (see ./Logger.ts). This
// builds the rule set; the builder half's configure steps materialize once a
// consumer registers the assembly for LOGGER_FILTER_OPTIONS_TOKEN (see
// ./tokens.ts).

// Side-effect + merge: installs `configure` (and the rest of the options
// pipeline verbs) onto di.core's ServiceManifest, and brings the interface
// merge that types `builder.services.configure(...)` below into the program.
import '@rhombus-std/options.augmentations';

import type { ILoggingBuilder, LogLevel } from '@rhombus-std/logging.core';
import { applyAugmentations, type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { LoggerFilterOptions, LoggerFilterRule } from './LoggerFilterOptions';
import { LOGGER_FILTER_OPTIONS_TOKEN } from './tokens';

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
    if (typeof categoryOrFilter === 'function') {
      options.rules.push(new LoggerFilterRule(undefined, undefined, undefined, categoryOrFilter));
    } else {
      options.rules.push(new LoggerFilterRule(undefined, categoryOrFilter, level, undefined));
    }
    return options;
  },
} satisfies AugmentationSet<LoggerFilterOptions>;

declare module './LoggerFilterOptions' {
  interface LoggerFilterOptions {
    addFilter(category: string | undefined, level: LogLevel): this;
    addFilter(filter: Func<[string | undefined, string | undefined, LogLevel], boolean>): this;
  }
}

applyAugmentations(LoggerFilterOptions, LoggerFilterOptionsExtensions);

/**
 * The `ILoggingBuilder`-targeted half of ME's `FilterLoggingBuilderExtensions`
 * (docs §28/§38): builder-level `addFilter` overloads that route through the
 * options-configure pipeline — each call registers a configure step against
 * {@link LOGGER_FILTER_OPTIONS_TOKEN} via the shared {@link configureFilter}
 * helper, the reference's `ConfigureFilter(options => options.AddFilter(...))`
 * bridge. OPEN receiver: registered against the `ILoggingBuilder` token below
 * and reachable as the standalone
 * `FilterLoggingBuilderExtensions.addFilter(builder, …)`. Same two overload
 * shapes as the options half above (see the header for the wider-matrix
 * disposition).
 */
export const FilterLoggingBuilderExtensions = {
  /** Adds a `(category, level)` rule, or a raw `(providerName, categoryName, level) => boolean` filter. */
  addFilter(
    builder: ILoggingBuilder,
    ...rest:
      | [category: string | undefined, level: LogLevel]
      | [filter: Func<[string | undefined, string | undefined, LogLevel], boolean>]
  ): ILoggingBuilder {
    return configureFilter(builder, (options) => {
      if (rest.length === 2) {
        LoggerFilterOptionsExtensions.addFilter(options, rest[0], rest[1]);
      } else {
        LoggerFilterOptionsExtensions.addFilter(options, rest[0]);
      }
    });
  },
} satisfies AugmentationSet<ILoggingBuilder>;

// The private-static `ConfigureFilter` helper the reference's builder overloads
// share — module-scoped, not a set member, because it is private in the
// reference and so not public surface. Registers `configureOptions` as a code
// configure step for the LOGGER_FILTER_OPTIONS_TOKEN options pipeline through
// options.augmentations' `configure` (installed on the manifest by the
// side-effect import above). The step runs when a consumer registers the
// assembly for the same token — `services.addOptions(LOGGER_FILTER_OPTIONS_TOKEN,
// () => new LoggerFilterOptions())` — and resolves it.
function configureFilter(
  builder: ILoggingBuilder,
  configureOptions: Func<[LoggerFilterOptions], void>,
): ILoggingBuilder {
  builder.services.configure(LOGGER_FILTER_OPTIONS_TOKEN, configureOptions);
  return builder;
}

// The method form (docs §38): merge onto the owning ILoggingBuilder interface —
// the same specifier every ILoggingBuilder merge in this family uses — so a
// consumer holding the interface sees `builder.addFilter(...)`. The concrete
// LoggingBuilder inherits it through its `interface LoggingBuilder extends
// ILoggingBuilder` merge (beside the class), so no class-side restatement is
// authored here.
declare module '@rhombus-std/logging.core' {
  interface ILoggingBuilder {
    addFilter(category: string | undefined, level: LogLevel): this;
    addFilter(filter: Func<[string | undefined, string | undefined, LogLevel], boolean>): this;
  }
}

registerAugmentations(nameof<ILoggingBuilder>(), FilterLoggingBuilderExtensions);
