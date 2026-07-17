// MetricsConfig -- ported from MED.Metrics's internal
// `MetricsConfig`. The marker `addMetricsConfig` registers (one
// per call, as a METRICS_CONFIGURATION_TOKEN collection value) so
// MetricListenerConfigFactory can enumerate every configuration bound to
// metrics and merge their per-listener sections. Internal in the reference;
// exported here so a plugin-less consumer wiring the config path by hand can
// register one directly.

import type { IConfig } from '@rhombus-std/config';

/** Marks an {@link IConfig} as bound to metrics via `addMetricsConfig`. */
export class MetricsConfig {
  /** The configuration section `addMetricsConfig` was given. */
  public readonly config: IConfig;

  /** @param config The configuration section bound to metrics. */
  public constructor(config: IConfig) {
    this.config = config;
  }
}
