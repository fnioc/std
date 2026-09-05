// The `ILoggingBuilder` augmentations `addProvider`/`setMinimumLevel`/`clearProviders`.
//
// `ILoggingBuilder` is extended by downstream packages (logging.config's
// addConfig, logging.console's addConsole), so installation goes through the
// augmentation registry: register the set against the `ILoggingBuilder` type,
// and the `@augment`-decorated `LoggingBuilder` pulls it (plus every later
// registrant) onto its prototype. The exported const is also the standalone
// call surface.

// Type-only: puts the sugar's declare-module faces in every program that
// compiles this source, with no runtime import of the authoring package.
import type {} from '@rhombus-std/di.extras';
import type { ILoggerProvider, ILoggingBuilder, LogLevel } from '@rhombus-std/logging.core';
import type { IConfigureOptions } from '@rhombus-std/options';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/types';
import { DefaultLoggerLevelConfigureOptions } from './DefaultLoggerLevelConfigureOptions';
import type { LoggerFilterOptions } from './LoggerFilterOptions';
import { LOGGER_PROVIDER_TYPE } from './types';

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
    this.services = this.services.addValue<ILoggerProvider>(provider);
    return this;
  }

  /**
   * Sets a minimum {@link LogLevel} for log messages — appends a
   * {@link DefaultLoggerLevelConfigureOptions} configure step to the
   * `IOptions<LoggerFilterOptions>` pipeline.
   */
  export function setMinimumLevel<Self extends ILoggingBuilder>(this: Self, level: LogLevel): Self {
    this.services = this.services.addValue<IConfigureOptions<LoggerFilterOptions>>(new DefaultLoggerLevelConfigureOptions(level));
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
