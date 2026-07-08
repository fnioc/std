// addMetricsConfiguration -- ported from MED.Metrics's
// `MetricsBuilderConfigurationExtensions.AddConfiguration`. Targets the family's
// own IMetricsBuilder, so it is a plain exported function (not an augmentation).
//
// Registers the config-binding pipeline the assembly reads, following the
// @rhombus-std/options.augmentations config-binding pattern: a ConfigureOptions
// step (the MetricsConfigureOptions parse) plus a ConfigurationChangeTokenSource
// wired to the configuration's reload token, so the assembled reactive
// `Options<MetricsOptions>` re-parses on reload. (The reference additionally
// registers a `MetricsConfiguration` marker singleton consumed by the metrics
// listener runtime; there is no such runtime here, so it is omitted.)

import type { IConfiguration } from "@rhombus-std/config";
import { METRICS_CHANGE_TOKEN_SOURCE_TOKEN, METRICS_CONFIGURE_TOKEN } from "@rhombus-std/diagnostics.core";
import type { IMetricsBuilder } from "@rhombus-std/diagnostics.core";
import { ConfigurationChangeTokenSource } from "@rhombus-std/options.augmentations";

import { MetricsConfigureOptions } from "./metrics-configure-options";

/**
 * Reads metrics enablement rules from `configuration` and configures which
 * meters, instruments, and listeners are enabled. Mirrors
 * `MetricsBuilderConfigurationExtensions.AddConfiguration`.
 */
export function addMetricsConfiguration(builder: IMetricsBuilder, configuration: IConfiguration): IMetricsBuilder {
  builder.services.addValue(METRICS_CONFIGURE_TOKEN, new MetricsConfigureOptions(configuration));
  builder.services.addValue(METRICS_CHANGE_TOKEN_SOURCE_TOKEN, new ConfigurationChangeTokenSource(configuration));
  return builder;
}
