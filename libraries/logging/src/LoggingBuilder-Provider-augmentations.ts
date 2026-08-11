// The `ILoggingBuilder` augmentations `addProvider`/`setMinimumLevel`/`clearProviders`.
//
// `ILoggingBuilder` is extended by downstream packages (logging.config's
// addConfig, logging.console's addConsole), so installation goes through the
// augmentation registry: register the set against the `ILoggingBuilder` token,
// and the `@augment`-decorated `LoggingBuilder` pulls it (plus every later
// registrant) onto its prototype. The exported const is also the standalone
// call surface.

import type { ILoggerProvider, ILoggingBuilder, LogLevel } from '@rhombus-std/logging.core';
import { configureStepToken } from '@rhombus-std/options.augmentations';
import { type AugmentationSet2, type Flatten, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor, typefor } from '@rhombus-std/primitives.extras';
import { DefaultLoggerLevelConfigureOptions } from './DefaultLoggerLevelConfigureOptions';
import { LOGGER_FILTER_OPTIONS_TOKEN, LOGGER_PROVIDER_TOKEN } from './tokens';

interface ILoggingBuilderProviderAugmentations {
  /**
   * Adds an {@link ILoggerProvider} to the builder, registered under the
   * enumerable {@link LOGGER_PROVIDER_TOKEN}.
   *
   * The `LoggerFactory` that `addLogging` builds is injected the aggregated
   * `Array<ILoggerProvider>` collection, so every provider added here receives
   * log output — no manual `new LoggerFactory([...providers])` needed.
   */
  addProvider(provider: ILoggerProvider): this;
  /**
   * Sets a minimum {@link LogLevel} for log messages — appends a
   * {@link DefaultLoggerLevelConfigureOptions} configure step to the
   * `IOptions<LoggerFilterOptions>` pipeline.
   */
  setMinimumLevel(level: LogLevel): this;
  /** Removes all {@link ILoggerProvider}s from the builder, via di.core's `removeAll` manifest verb. */
  clearProviders(): this;
}

// Merges onto the ILoggingBuilder interface so a consumer holding it sees the
// methods; the concrete LoggingBuilder inherits them through its own
// `interface LoggingBuilder extends ILoggingBuilder` merge.
declare module '@rhombus-std/logging.core' {
  interface ILoggingBuilder extends ILoggingBuilderProviderAugmentations {}
}

export const LoggingBuilderProviderAugmentations: AugmentationSet2<ILoggingBuilder,
  Flatten<ILoggingBuilderProviderAugmentations>> = {
    addProvider(builder, provider) {
      builder.services = builder.services.addValue(LOGGER_PROVIDER_TOKEN, provider);
      return builder;
    },
    setMinimumLevel(builder, level) {
      builder.services = builder.services.addValue(configureStepToken(LOGGER_FILTER_OPTIONS_TOKEN),
        new DefaultLoggerLevelConfigureOptions(level));
      return builder;
    },
    clearProviders(builder) {
      builder.services = builder.services.removeAll(LOGGER_PROVIDER_TOKEN);
      return builder;
    },
  };

registerAugmentations(typefor<ILoggingBuilder>(), LoggingBuilderProviderAugmentations);
