// The ILoggingBuilder augmentations, ported from ME.Logging's
// `LoggingBuilderExtensions`. Authored as the named `LoggingBuilderExtensions`
// object literal (docs §28), receiver-first members; the concrete LoggingBuilder
// lives in this package, so both the declaration merge (onto the interface AND the
// concrete class, so the class still satisfies `implements ILoggingBuilder` once
// the names are on it) and the runtime registration live here.
//
// This is an OPEN receiver (ILoggingBuilder is extended by downstream packages —
// logging.configuration's addConfiguration, logging.console's addConsole), so the
// install goes through the augmentation registry (docs §38): register the set
// against the `ILoggingBuilder` token — derived inline by `nameof<ILoggingBuilder>()`
// and lowered to its string literal by the primitives.transformer build stage —
// and the `@augment`-decorated LoggingBuilder pulls it (plus every later
// registrant) onto its prototype. The exported const IS the standalone call surface.
//
// `addProvider` is mechanical, and `clearProviders` ports through di.core's
// `removeAll` descriptor verb. `setMinimumLevel` routes through
// `builder.Services.Configure<LoggerFilterOptions>(...)` in the reference, and
// that filter layer is deferred — it stays a throwing stub (issue #75); giving
// it the method form keeps the surface symmetric — the method throws exactly as
// the standalone member does.

import type { ILoggerProvider, ILoggingBuilder, LogLevel } from "@rhombus-std/logging.core";
import { type AugmentationSet, registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import { LOGGER_PROVIDER_TOKEN } from "./tokens";

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
   * NOTE: the registration is real, but a `LoggerFactory` built via `addLogging`
   * does not yet INJECT this provider set (provider enumeration into the factory
   * is deferred — issue #75). Until then, compose providers explicitly with
   * `new LoggerFactory([...providers])`.
   */
  addProvider(builder: ILoggingBuilder, provider: ILoggerProvider): ILoggingBuilder {
    builder.services.addValue(LOGGER_PROVIDER_TOKEN, provider);
    return builder;
  },

  /**
   * Sets a minimum {@link LogLevel} for log messages.
   *
   * NOT IMPLEMENTED: the reference sets this by registering an
   * `IConfigureOptions<LoggerFilterOptions>` via `builder.Services.Configure(...)`.
   * That options-registration surface is not available (see the file header), and
   * the filter layer that would read it is deferred (see ./logger.ts). Configure a
   * `LoggerFilterOptions` directly and pass it to a `LoggerFactory` once the filter
   * layer lands.
   */
  setMinimumLevel(_builder: ILoggingBuilder, _level: LogLevel): ILoggingBuilder {
    throw new Error(
      "setMinimumLevel() is not implemented: it needs IServiceCollection.Configure<LoggerFilterOptions> "
        + "(the options DI-builder augmentation @rhombus-std/options defers) plus the deferred filter layer. "
        + "See issue #75.",
    );
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
// consumer holding it sees the methods, and onto the concrete LoggingBuilder so it
// still SATISFIES `implements ILoggingBuilder` once the names are on the interface
// (its source is recompiled in this program under source-libs). The class-side
// merge is retired once logging is dist-built (plan section 5).
declare module "@rhombus-std/logging.core" {
  interface ILoggingBuilder {
    addProvider(provider: ILoggerProvider): this;
    setMinimumLevel(level: LogLevel): this;
    clearProviders(): this;
  }
}

declare module "./LoggingBuilder" {
  interface LoggingBuilder {
    addProvider(provider: ILoggerProvider): this;
    setMinimumLevel(level: LogLevel): this;
    clearProviders(): this;
  }
}

registerAugmentations(nameof<ILoggingBuilder>(), LoggingBuilderExtensions);
