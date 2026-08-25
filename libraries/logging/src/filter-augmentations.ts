// `addFilter` has two receivers under one name: `LoggerFilterOptions` (appends a
// rule directly) and `ILoggingBuilder` (registers a configure step that appends
// the same rule once the options pipeline assembles the LoggerFilterOptions).

import type { ILoggingBuilder, LogLevel } from '@rhombus-std/logging.core';
import { getConfigureManifest } from '@rhombus-std/options.augmentations';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import type { Flatten } from '@rhombus-toolkit/type-helpers';
import { LoggerFilterOptions, LoggerFilterRule } from './LoggerFilterOptions';
import { LOGGER_FILTER_OPTIONS_TYPE } from './types';

export namespace LoggerFilterOptionsExtensions {
  /** Adds a `(category, level)` rule, or a raw `(providerName, categoryName, level) => boolean` filter. */
  export function addFilter<Self extends LoggerFilterOptions>(this: Self, category: string | undefined, level: LogLevel): Self;
  export function addFilter<Self extends LoggerFilterOptions>(this: Self, filter: Func<[string | undefined, string | undefined, LogLevel], boolean>): Self;
  export function addFilter<Self extends LoggerFilterOptions>(this: Self, first: string | undefined | Func<[string | undefined, string | undefined, LogLevel], boolean>,
    ...rest: readonly any[]): Self {
    if (typeof first === 'function') {
      this.rules.push(new LoggerFilterRule(undefined, undefined, undefined, first));
    } else {
      this.rules.push(new LoggerFilterRule(undefined, first, rest[0] as LogLevel, undefined));
    }
    return this;
  }
}

declare module './LoggerFilterOptions' {
  interface LoggerFilterOptions extends Flatten<typeof LoggerFilterOptionsExtensions> {}
}

registerAugmentations<LoggerFilterOptions>(LoggerFilterOptionsExtensions);

export namespace FilterLoggingBuilderExtensions {
  /** Adds a `(category, level)` rule, or a raw `(providerName, categoryName, level) => boolean` filter. */
  export function addFilter<Self extends ILoggingBuilder>(this: Self, category: string | undefined, level: LogLevel): Self;
  export function addFilter<Self extends ILoggingBuilder>(this: Self, filter: Func<[string | undefined, string | undefined, LogLevel], boolean>): Self;
  export function addFilter<Self extends ILoggingBuilder>(this: Self, first: string | undefined | Func<[string | undefined, string | undefined, LogLevel], boolean>, ...rest: readonly any[]): Self {
    return configureFilter(this, (options) => {
      if (typeof first === 'function') {
        options.addFilter(first);
      } else {
        options.addFilter(first, rest[0] as LogLevel);
      }
    }) as Self;
  }
}

declare module '@rhombus-std/logging.core' {
  interface ILoggingBuilder extends Flatten<typeof FilterLoggingBuilderExtensions> {}
}

/** Registers `configureOptions` as a configure step for the {@link LOGGER_FILTER_OPTIONS_TYPE} pipeline. */
function configureFilter(builder: ILoggingBuilder, configureOptions: Func<[LoggerFilterOptions], void>): ILoggingBuilder {
  // getConfigureManifest returns its own self-contained manifest; merging it in
  // is what writes the step into the builder's slot -- a bare call would
  // register nothing.
  builder.services = builder.services.addMany(getConfigureManifest(LOGGER_FILTER_OPTIONS_TYPE, configureOptions));
  return builder;
}

registerAugmentations<ILoggingBuilder>(FilterLoggingBuilderExtensions);
