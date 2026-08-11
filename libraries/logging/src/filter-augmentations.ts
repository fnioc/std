// `addFilter` has two receivers under one name: `LoggerFilterOptions` (appends a
// rule directly) and `ILoggingBuilder` (registers a configure step that appends
// the same rule once the options pipeline assembles the LoggerFilterOptions).

// Side-effect + merge: installs `configure` (and the rest of the options
// pipeline verbs) onto di.core's ServiceManifest, and brings the interface
// merge that types `builder.services.configure(...)` below into the program.
import '@rhombus-std/options.augmentations';

import type { ILoggingBuilder, LogLevel } from '@rhombus-std/logging.core';
import { AugmentationSet2, registerAugmentations } from '@rhombus-std/primitives';
import type { Flatten } from '@rhombus-std/primitives';
import { tokenfor, typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { LoggerFilterOptions, LoggerFilterRule } from './LoggerFilterOptions';
import { LOGGER_FILTER_OPTIONS_TOKEN } from './tokens';
interface ILoggerFilterOptionsExtensions {
  addFilter(category: string | undefined, level: LogLevel): this;
  addFilter(filter: Func<[string | undefined, string | undefined, LogLevel], boolean>): this;
}

export const LoggerFilterOptionsExtensions: AugmentationSet2<LoggerFilterOptions,
  Flatten<ILoggerFilterOptionsExtensions>> = {
    /** Adds a `(category, level)` rule, or a raw `(providerName, categoryName, level) => boolean` filter. */
    addFilter(options: LoggerFilterOptions, ...rest: [category: string | undefined, level: LogLevel] | [
      filter: Func<[string | undefined, string | undefined, LogLevel], boolean>,
    ]): LoggerFilterOptions {
      const [categoryOrFilter, level] = rest;
      if (typeof categoryOrFilter === 'function') {
        options.rules.push(new LoggerFilterRule(undefined, undefined, undefined, categoryOrFilter));
      } else {
        options.rules.push(new LoggerFilterRule(undefined, categoryOrFilter, level, undefined));
      }
      return options;
    },
  };

declare module './LoggerFilterOptions' {
  interface LoggerFilterOptions extends ILoggerFilterOptionsExtensions {}
}

registerAugmentations(typefor<LoggerFilterOptions>(), LoggerFilterOptionsExtensions);

interface IFilterLoggingBuilderExtensions {
  addFilter(category: string | undefined, level: LogLevel): this;
  addFilter(filter: Func<[string | undefined, string | undefined, LogLevel], boolean>): this;
}
declare module '@rhombus-std/logging.core' {
  interface ILoggingBuilder extends IFilterLoggingBuilderExtensions {}
}
export const FilterLoggingBuilderExtensions: AugmentationSet2<ILoggingBuilder,
  Flatten<IFilterLoggingBuilderExtensions>> = {
    /** Adds a `(category, level)` rule, or a raw `(providerName, categoryName, level) => boolean` filter. */
    addFilter(builder, ...rest) {
      return configureFilter(builder, (options) => {
        options.addFilter(...rest);
      });
    },
  };

/** Registers `configureOptions` as a configure step for the {@link LOGGER_FILTER_OPTIONS_TOKEN} pipeline. */
function configureFilter(builder: ILoggingBuilder,
  configureOptions: Func<[LoggerFilterOptions], void>): ILoggingBuilder {
  // The chain is immutable: `configure` hands back a NEW manifest, so it must be
  // written into the builder's slot -- a bare call would register nothing.
  builder.services = builder.services.configure(LOGGER_FILTER_OPTIONS_TOKEN, configureOptions);
  return builder;
}

registerAugmentations(typefor<ILoggingBuilder>(), FilterLoggingBuilderExtensions);
