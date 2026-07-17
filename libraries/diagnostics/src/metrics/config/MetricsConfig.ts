// MetricsConfig -- ported from MED.Metrics's internal
// `MetricsConfig`. The marker `addMetricsConfiguration` registers (one
// per call, as a METRICS_CONFIGURATION_TOKEN collection value) so
// MetricListenerConfigFactory can enumerate every configuration bound to
// metrics and merge their per-listener sections. Internal in the reference;
// exported here so a plugin-less consumer wiring the config path by hand can
// register one directly.

import type { IConfig } from '@rhombus-std/config';

/** Marks an {@link IConfig} as bound to metrics via `addMetricsConfiguration`. */
export class MetricsConfig {
  /** The configuration section `addMetricsConfiguration` was given. */
  public readonly configuration: IConfig;

  /** @param configuration The configuration section bound to metrics. */
  public constructor(configuration: IConfig) {
    this.configuration = configuration;
  }
}
