// The ILoggingBuilder augmentations, ported from ME.Logging's
// `LoggingBuilderExtensions`. Authored as the named `LoggingBuilderExtensions`
// object literal (docs §28), receiver-first members; installed onto the concrete
// LoggingBuilder in ./builder-augmentations (the interface lives in this family's
// logging.core, the concrete class here).
//
// Only `addProvider` is mechanical without further infrastructure; the rest of
// the reference builder extensions route through `builder.Services.Configure<
// LoggerFilterOptions>(...)`, and that options-registration surface
// (`IServiceCollection.Configure`) is not present — @rhombus-std/options
// deliberately defers the DI-builder `addOptions`/`configure` augmentation (see
// its README). They are stubbed hosting-style with the reason, not silently
// dropped, so the deferred surface stays discoverable.

import type { ILoggerProvider, ILoggingBuilder, LogLevel } from "@rhombus-std/logging.core";
import type { AugmentationSet } from "@rhombus-std/primitives";
import { LOGGER_PROVIDER_TOKEN } from "./tokens";

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
function addProvider(builder: ILoggingBuilder, provider: ILoggerProvider): ILoggingBuilder {
  builder.services.addValue(LOGGER_PROVIDER_TOKEN, provider);
  return builder;
}

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
function setMinimumLevel(_builder: ILoggingBuilder, _level: LogLevel): ILoggingBuilder {
  throw new Error(
    "setMinimumLevel() is not implemented: it needs IServiceCollection.Configure<LoggerFilterOptions> "
      + "(the options DI-builder augmentation @rhombus-std/options defers) plus the deferred filter layer. "
      + "See issue #75.",
  );
}

/**
 * Removes all {@link ILoggerProvider}s from the builder.
 *
 * NOT IMPLEMENTED: the reference calls `builder.Services.RemoveAll<ILoggerProvider>()`.
 * @rhombus-std/di.core's registration builder has no remove/removeAll surface
 * (registrations are append-only, last-wins), so there is no mechanical port.
 * Deferred — see issue #75.
 */
function clearProviders(_builder: ILoggingBuilder): ILoggingBuilder {
  throw new Error(
    "clearProviders() is not implemented: @rhombus-std/di.core registrations are append-only with no "
      + "removeAll surface. See issue #75.",
  );
}

/**
 * The `LoggingBuilderExtensions` augmentation set for {@link ILoggingBuilder}
 * (docs §28). Installed onto the concrete LoggingBuilder in ./builder-augmentations.
 */
export const LoggingBuilderExtensions = {
  addProvider,
  setMinimumLevel,
  clearProviders,
} satisfies AugmentationSet<ILoggingBuilder>;
