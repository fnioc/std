// The `ILoggingBuilder` augmentations `addProvider`/`setMinimumLevel`/`clearProviders`.
//
// `ILoggingBuilder` is extended by downstream packages (logging.config's
// addConfig, logging.console's addConsole), so installation goes through the
// augmentation registry: register the set against the `ILoggingBuilder` token,
// and the `@augment`-decorated `LoggingBuilder` pulls it (plus every later
// registrant) onto its prototype. The exported const is also the standalone
// call surface.

import type { ILoggerProvider, ILoggingBuilder, LogLevel } from '@rhombus-std/logging.core';
import { configureStepType } from '@rhombus-std/options.augmentations';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/type-helpers';
import { DefaultLoggerLevelConfigureOptions } from './DefaultLoggerLevelConfigureOptions';
import { LOGGER_FILTER_OPTIONS_TYPE, LOGGER_PROVIDER_TYPE } from './types';

export namespace LoggingBuilderProviderAugmentations {
  /**
   * Adds an {@link ILoggerProvider} to the builder, registered under the
   * enumerable {@link LOGGER_PROVIDER_TYPE}.
   *
   * The `LoggerFactory` that `addLogging` builds is injected the aggregated
   * `Array<ILoggerProvider>` collection, so every provider added here receives
   * log output — no manual `new LoggerFactory([...providers])` needed.
   */
  export function addProvider<Self extends ILoggingBuilder>(this: Self, provider: ILoggerProvider): Self {
    this.services = this.services.add(LOGGER_PROVIDER_TYPE, provider);
    return this;
  }

  /**
   * Sets a minimum {@link LogLevel} for log messages — appends a
   * {@link DefaultLoggerLevelConfigureOptions} configure step to the
   * `IOptions<LoggerFilterOptions>` pipeline.
   */
  export function setMinimumLevel<Self extends ILoggingBuilder>(this: Self, level: LogLevel): Self {
    this.services = this.services.add(configureStepType(LOGGER_FILTER_OPTIONS_TYPE), new DefaultLoggerLevelConfigureOptions(level));
    return this;
  }

  /** Removes all {@link ILoggerProvider}s from the builder, via di.core's `removeAll` manifest verb. */
  export function clearProviders<Self extends ILoggingBuilder>(this: Self): Self {
    this.services = this.services.removeAll(LOGGER_PROVIDER_TYPE);
    return this;
  }
}

// Merges onto the ILoggingBuilder interface so a consumer holding it sees the
// methods; the concrete LoggingBuilder inherits them through its own
// `interface LoggingBuilder extends ILoggingBuilder` merge.
declare module '@rhombus-std/logging.core' {
  interface ILoggingBuilder extends Flatten<typeof LoggingBuilderProviderAugmentations> {}
}

registerAugmentations<ILoggingBuilder>(LoggingBuilderProviderAugmentations);
