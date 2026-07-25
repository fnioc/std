// `addFilter` has two receivers under one name: `LoggerFilterOptions` (appends a
// rule directly) and `ILoggingBuilder` (registers a configure step that appends
// the same rule once the options pipeline assembles the LoggerFilterOptions).

// Side-effect + merge: installs `configure` (and the rest of the options
// pipeline verbs) onto di.core's ServiceManifest, and brings the interface
// merge that types `builder.services.configure(...)` below into the program.
import '@rhombus-std/options.augmentations';

import type { ILoggingBuilder, LogLevel } from '@rhombus-std/logging.core';
import { applyAugmentations, type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { LoggerFilterOptions, LoggerFilterRule } from './LoggerFilterOptions';
import { LOGGER_FILTER_OPTIONS_TOKEN } from './tokens';

export const LoggerFilterOptionsExtensions = {
  /** Adds a `(category, level)` rule, or a raw `(providerName, categoryName, level) => boolean` filter. */
  addFilter(options: LoggerFilterOptions,
    ...rest: [category: string | undefined, level: LogLevel] | [
      filter: Func<[string | undefined, string | undefined, LogLevel], boolean>,
    ]): LoggerFilterOptions
  {
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

export const FilterLoggingBuilderExtensions = {
  /** Adds a `(category, level)` rule, or a raw `(providerName, categoryName, level) => boolean` filter. */
  addFilter(builder: ILoggingBuilder,
    ...rest: [category: string | undefined, level: LogLevel] | [
      filter: Func<[string | undefined, string | undefined, LogLevel], boolean>,
    ]): ILoggingBuilder
  {
    return configureFilter(builder, (options) => {
      if (rest.length === 2) {
        LoggerFilterOptionsExtensions.addFilter(options, rest[0], rest[1]);
      } else {
        LoggerFilterOptionsExtensions.addFilter(options, rest[0]);
      }
    });
  },
} satisfies AugmentationSet<ILoggingBuilder>;

/** Registers `configureOptions` as a configure step for the {@link LOGGER_FILTER_OPTIONS_TOKEN} pipeline. */
function configureFilter(builder: ILoggingBuilder,
  configureOptions: Func<[LoggerFilterOptions], void>): ILoggingBuilder
{
  // The chain is immutable: `configure` hands back a NEW manifest, so it must be
  // written into the builder's slot -- a bare call would register nothing.
  builder.services = builder.services.configure(LOGGER_FILTER_OPTIONS_TOKEN, configureOptions);
  return builder;
}

declare module '@rhombus-std/logging.core' {
  interface ILoggingBuilder {
    addFilter(category: string | undefined, level: LogLevel): this;
    addFilter(filter: Func<[string | undefined, string | undefined, LogLevel], boolean>): this;
  }
}

registerAugmentations(tokenfor<ILoggingBuilder>(), FilterLoggingBuilderExtensions);
