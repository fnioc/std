// MetricListenerConfigFactory -- ported from MED.Metrics's internal
// `MetricListenerConfigFactory`. The concrete
// IMetricListenerConfigFactory `addMetrics` registers: it takes every
// MetricsConfig marker registered through `addMetricsConfiguration` (the
// METRICS_CONFIGURATION_TOKEN collection, ctor-injected) and, per listener name,
// chains each configuration's `{listenerName}` section into one merged view --
// later registrations win on key conflicts, matching provider order. Internal in
// the reference; exported here so a plugin-less consumer can construct one over
// hand-registered markers.

import { ConfigBuilder, type IConfig } from '@rhombus-std/config';

import type { IMetricListenerConfigFactory } from './IMetricListenerConfigFactory';
import type { MetricsConfig } from './MetricsConfig';

/** The concrete {@link IMetricListenerConfigFactory}. */
export class MetricListenerConfigFactory implements IMetricListenerConfigFactory {
  readonly #configurations: Iterable<MetricsConfig>;

  /** @param configurations Every registered {@link MetricsConfig} marker. */
  public constructor(configurations: Iterable<MetricsConfig>) {
    this.#configurations = configurations;
  }

  /** Merges every registered configuration's `listenerName` section into one view. */
  public getConfiguration(listenerName: string): IConfig {
    const builder = new ConfigBuilder();
    for (const { configuration } of this.#configurations) {
      builder.addConfiguration(configuration.getSection(listenerName));
    }
    return builder.build();
  }
}
