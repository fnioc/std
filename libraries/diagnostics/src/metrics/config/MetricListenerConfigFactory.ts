// MetricListenerConfigFactory -- ported from MED.Metrics's internal
// `MetricListenerConfigFactory`. The concrete
// IMetricListenerConfigFactory `addMetrics` registers: it takes every
// MetricsConfig marker registered through `addMetricsConfig` (the
// METRICS_CONFIGURATION_TOKEN collection, ctor-injected) and, per listener name,
// chains each configuration's `{listenerName}` section into one merged view --
// later registrations win on key conflicts, matching provider order. Internal in
// the reference; exported here so a plugin-less consumer can construct one over
// hand-registered markers.

import { ConfigBuilder } from '@rhombus-std/config';
import type { IConfig } from '@rhombus-std/config.core';

import type { IMetricListenerConfigFactory } from './IMetricListenerConfigFactory';
import type { MetricsConfig } from './MetricsConfig';

/** The concrete {@link IMetricListenerConfigFactory}. */
export class MetricListenerConfigFactory implements IMetricListenerConfigFactory {
  readonly #configs: Iterable<MetricsConfig>;

  /** @param configs Every registered {@link MetricsConfig} marker. */
  public constructor(configs: Iterable<MetricsConfig>) {
    this.#configs = configs;
  }

  /** Merges every registered configuration's `listenerName` section into one view. */
  public getConfig(listenerName: string): IConfig {
    const builder = new ConfigBuilder();
    for (const { config } of this.#configs) {
      builder.addConfig(config.getSection(listenerName));
    }
    return builder.build();
  }
}
