// addConfiguration — binds LoggerFilterOptions from an IConfiguration, ported
// from ME.Logging.Configuration's `LoggingBuilderExtensions.AddConfiguration(
// this ILoggingBuilder, IConfiguration)`.
//
// ILoggingBuilder is @rhombus-std/logging.core's own interface; IConfiguration is
// a parameter type only (from @rhombus-std/config.core). Per the augmentation
// convention (docs §28/§38) this ships BOTH forms: the receiver-first free function
// below is the authored/standalone form, and it is ALSO registered against the
// ILoggingBuilder augmentation token so the @augment-decorated LoggingBuilder pulls
// `builder.addConfiguration(cfg)` onto its prototype. ILoggingBuilder is an OPEN
// receiver, so this downstream extender registers against the shared token; the
// interface merge lives here (the member is this package's), the class-side merge too
// while logging is still source-referenced.
//
// Faithfulness note. The reference registers a LAZY `IConfigureOptions<
// LoggerFilterOptions>` (+ an `IOptionsChangeTokenSource` for reload
// reactivity) that runs when the options are materialized. That pipeline needs
// the options-monitor DI integration @rhombus-std/options defers (see its
// README). This EAGERLY binds a `LoggerFilterOptions` at call time and registers
// it as a resolvable value — real, consumable behavior, minus reload
// reactivity. The change-token source and the provider-configuration factory
// services (`AddConfiguration()` no-arg / `ILoggerProviderConfigurationFactory`,
// provider-oriented) are deferred with the rest of the provider work (issue #75).

import type { IConfiguration } from "@rhombus-std/config.core";
import { LoggerFilterOptions } from "@rhombus-std/logging";
import type { ILoggingBuilder } from "@rhombus-std/logging.core";
import { registerAugmentations } from "@rhombus-std/primitives";
import type { AugmentationSet } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import { bindLoggerFilterOptions } from "./filter-options-binding";
import { LoggingConfiguration } from "./logging-configuration";

/** Token the config-bound {@link LoggerFilterOptions} is registered under. */
export const LOGGER_FILTER_OPTIONS_TOKEN = "@rhombus-std/logging.configuration:LoggerFilterOptions";

/** Token the {@link LoggingConfiguration} holder is registered under. */
export const LOGGING_CONFIGURATION_TOKEN = "@rhombus-std/logging.configuration:LoggingConfiguration";

/**
 * Configures {@link LoggerFilterOptions} from `configuration` and registers the
 * bound options + the raw {@link LoggingConfiguration} on the builder. Returns
 * the builder for chaining.
 */
function addConfiguration(builder: ILoggingBuilder, configuration: IConfiguration): ILoggingBuilder {
  const options = new LoggerFilterOptions();
  bindLoggerFilterOptions(configuration, options);
  builder.services.addValue(LOGGER_FILTER_OPTIONS_TOKEN, options);
  builder.services.addValue(LOGGING_CONFIGURATION_TOKEN, new LoggingConfiguration(configuration));
  return builder;
}

/**
 * The `LoggingBuilderExtensions` augmentation set for {@link ILoggingBuilder}
 * (docs §28) -- mirrors ME.Logging.Configuration's `LoggingBuilderExtensions`.
 */
export const LoggingBuilderExtensions = {
  addConfiguration,
} satisfies AugmentationSet<ILoggingBuilder>;

// The method form (docs §38): merge onto the owning ILoggingBuilder interface so a
// consumer holding it sees the method, then register the set against the shared
// ILoggingBuilder augmentation token so the @augment-decorated LoggingBuilder pulls
// it onto its prototype.
declare module "@rhombus-std/logging.core" {
  interface ILoggingBuilder {
    /** Instance-method form of {@link addConfiguration}. */
    addConfiguration(configuration: IConfiguration): this;
  }
}

// The concrete LoggingBuilder `implements ILoggingBuilder`, and under source-libs
// its source is recompiled in this program -- so once the interface gains
// `addConfiguration` the class must declare it too. Merge onto the DECLARING module
// (reachable via logging's `internal/*` subpath), not the barrel: a class
// re-exported through the barrel doesn't merge back onto its own declaring module.
// Retired once logging is dist-built (plan section 5).
declare module "@rhombus-std/logging/internal/logging-builder" {
  interface LoggingBuilder {
    addConfiguration(configuration: IConfiguration): this;
  }
}

registerAugmentations(nameof<ILoggingBuilder>(), LoggingBuilderExtensions);
