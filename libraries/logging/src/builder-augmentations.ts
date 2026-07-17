// The ILoggingBuilder augmentations, ported from ME.Logging's
// `LoggingBuilderExtensions`. Authored as the named `LoggingBuilderExtensions`
// object literal (docs §28), receiver-first members; the concrete LoggingBuilder
// lives in this package, so both the declaration merge (onto the interface AND the
// concrete class, so the class still satisfies `implements ILoggingBuilder` once
// the names are on it) and the runtime registration live here.
//
// This is an OPEN receiver (ILoggingBuilder is extended by downstream packages —
// logging.config's addConfiguration, logging.console's addConsole), so the
// install goes through the augmentation registry (docs §38): register the set
// against the `ILoggingBuilder` token — derived inline by `nameof<ILoggingBuilder>()`
// and lowered to its string literal by the primitives.transformer build stage —
// and the `@augment`-decorated LoggingBuilder pulls it (plus every later
// registrant) onto its prototype. The exported const IS the standalone call surface.
//
// `addProvider` is mechanical, and `clearProviders` ports through di.core's
// `removeAll` descriptor verb. `setMinimumLevel` mirrors the reference's
// `builder.Services.Add(Singleton<IConfigureOptions<LoggerFilterOptions>>(new
// DefaultLoggerLevelConfigureOptions(level)))`: it appends a
// `DefaultLoggerLevelConfigureOptions` configure step to the
// `IOptions<LoggerFilterOptions>` pipeline (keyed at LOGGER_FILTER_OPTIONS_TOKEN),
// so the assembled options — the one the LoggerFactory consumes — pick up the
// new minimum level in registration order.

import type { ILoggerProvider, ILoggingBuilder, LogLevel } from '@rhombus-std/logging.core';
import { configureStepToken } from '@rhombus-std/options.augmentations';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import { DefaultLoggerLevelConfigureOptions } from './default-logger-level-configure-options';
import { LOGGER_FILTER_OPTIONS_TOKEN, LOGGER_PROVIDER_TOKEN } from './tokens';

/**
 * The `LoggingBuilderExtensions` augmentation set for {@link ILoggingBuilder}
 * (docs §28/§38). Registered against the `ILoggingBuilder` token below and
 * reachable as the standalone `LoggingBuilderExtensions.addProvider(builder, …)`.
 */
export const LoggingBuilderExtensions = {
  /**
   * Adds an {@link ILoggerProvider} to the builder — the mechanical port of
   * `builder.Services.AddSingleton(provider)`, registered under the enumerable
   * {@link LOGGER_PROVIDER_TOKEN}.
   *
   * The `LoggerFactory` that `addLogging` builds consumes this registration: it
   * is injected the aggregated `Array<ILoggerProvider>` collection (wired in
   * `add-logging.ts`), so every provider added here receives log output — no
   * manual `new LoggerFactory([...providers])` needed (§62).
   */
  addProvider(builder: ILoggingBuilder, provider: ILoggerProvider): ILoggingBuilder {
    builder.services.addValue(LOGGER_PROVIDER_TOKEN, provider);
    return builder;
  },

  /**
   * Sets a minimum {@link LogLevel} for log messages — appends a
   * {@link DefaultLoggerLevelConfigureOptions} configure step to the
   * `IOptions<LoggerFilterOptions>` pipeline, the port of the reference's
   * `builder.Services.Add(IConfigureOptions<LoggerFilterOptions>)`.
   */
  setMinimumLevel(builder: ILoggingBuilder, level: LogLevel): ILoggingBuilder {
    builder.services.addValue(
      configureStepToken(LOGGER_FILTER_OPTIONS_TOKEN),
      new DefaultLoggerLevelConfigureOptions(level),
    );
    return builder;
  },

  /**
   * Removes all {@link ILoggerProvider}s from the builder — the mechanical port
   * of `builder.Services.RemoveAll<ILoggerProvider>()`, via di.core's
   * `ServiceCollectionDescriptorExtensions.removeAll` (installed as a manifest
   * method through the augmentation registry).
   */
  clearProviders(builder: ILoggingBuilder): ILoggingBuilder {
    builder.services.removeAll(LOGGER_PROVIDER_TOKEN);
    return builder;
  },
} satisfies AugmentationSet<ILoggingBuilder>;

// The method form (docs §38): merge onto the owning ILoggingBuilder interface so a
// consumer holding it sees the methods. The concrete LoggingBuilder inherits them
// through its `interface LoggingBuilder extends ILoggingBuilder` merge (beside the
// class), so no class-side restatement is authored here.
declare module '@rhombus-std/logging.core' {
  interface ILoggingBuilder {
    addProvider(provider: ILoggerProvider): this;
    setMinimumLevel(level: LogLevel): this;
    clearProviders(): this;
  }
}

registerAugmentations(nameof<ILoggingBuilder>(), LoggingBuilderExtensions);
