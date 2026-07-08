// addTracingConfiguration -- ported from MED.Tracing's
// `TracingBuilderConfigurationExtensions.AddConfiguration`. The tracing analog of
// addMetricsConfiguration.

import type { IConfiguration } from "@rhombus-std/config";
import { TRACING_CHANGE_TOKEN_SOURCE_TOKEN, TRACING_CONFIGURE_TOKEN } from "@rhombus-std/diagnostics.core";
import type { ITracingBuilder } from "@rhombus-std/diagnostics.core";
import { ConfigurationChangeTokenSource } from "@rhombus-std/options.augmentations";

import { TracingConfigureOptions } from "./tracing-configure-options";

/**
 * Reads tracing enablement rules from `configuration` and configures which
 * activity sources and activities are enabled. Mirrors
 * `TracingBuilderConfigurationExtensions.AddConfiguration`.
 */
export function addTracingConfiguration(builder: ITracingBuilder, configuration: IConfiguration): ITracingBuilder {
  builder.services.addValue(TRACING_CONFIGURE_TOKEN, new TracingConfigureOptions(configuration));
  builder.services.addValue(TRACING_CHANGE_TOKEN_SOURCE_TOKEN, new ConfigurationChangeTokenSource(configuration));
  return builder;
}
