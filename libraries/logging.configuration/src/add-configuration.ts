// addConfiguration — binds LoggerFilterOptions from an IConfiguration, ported
// from ME.Logging.Configuration's `LoggingBuilderExtensions.AddConfiguration(
// this ILoggingBuilder, IConfiguration)`.
//
// ILoggingBuilder is @rhombus-std/logging.core's own interface and IConfiguration
// is a parameter type only (from @rhombus-std/config.core) — neither is patched —
// so this is a plain exported function taking the builder first, per the repo's
// "explicit form is primary" convention. No augmentation.
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
export function addConfiguration(builder: ILoggingBuilder, configuration: IConfiguration): ILoggingBuilder {
  const options = new LoggerFilterOptions();
  bindLoggerFilterOptions(configuration, options);
  builder.services.addValue(LOGGER_FILTER_OPTIONS_TOKEN, options);
  builder.services.addValue(LOGGING_CONFIGURATION_TOKEN, new LoggingConfiguration(configuration));
  return builder;
}
