// MetricsConfiguration -- ported from MED.Metrics's internal
// `MetricsConfiguration`. The marker `addMetricsConfiguration` registers (one
// per call, as a METRICS_CONFIGURATION_TOKEN collection value) so
// MetricListenerConfigurationFactory can enumerate every configuration bound to
// metrics and merge their per-listener sections. Internal in the reference;
// exported here so a plugin-less consumer wiring the config path by hand can
// register one directly.

import type { IConfiguration } from "@rhombus-std/config";

/** Marks an {@link IConfiguration} as bound to metrics via `addMetricsConfiguration`. */
export class MetricsConfiguration {
  /** The configuration section `addMetricsConfiguration` was given. */
  public readonly configuration: IConfiguration;

  /** @param configuration The configuration section bound to metrics. */
  public constructor(configuration: IConfiguration) {
    this.configuration = configuration;
  }
}
