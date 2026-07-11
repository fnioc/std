// MetricListenerConfigurationFactory -- ported from MED.Metrics's internal
// `MetricListenerConfigurationFactory`. The concrete
// IMetricListenerConfigurationFactory `addMetrics` registers: it takes every
// MetricsConfiguration marker registered through `addMetricsConfiguration` (the
// METRICS_CONFIGURATION_TOKEN collection, ctor-injected) and, per listener name,
// chains each configuration's `{listenerName}` section into one merged view --
// later registrations win on key conflicts, matching provider order. Internal in
// the reference; exported here so a plugin-less consumer can construct one over
// hand-registered markers.

import { ConfigurationBuilder, type IConfiguration } from '@rhombus-std/config';

import type { IMetricListenerConfigurationFactory } from './IMetricListenerConfigurationFactory';
import type { MetricsConfiguration } from './MetricsConfiguration';

/** The concrete {@link IMetricListenerConfigurationFactory}. */
export class MetricListenerConfigurationFactory implements IMetricListenerConfigurationFactory {
  readonly #configurations: Iterable<MetricsConfiguration>;

  /** @param configurations Every registered {@link MetricsConfiguration} marker. */
  public constructor(configurations: Iterable<MetricsConfiguration>) {
    this.#configurations = configurations;
  }

  /** Merges every registered configuration's `listenerName` section into one view. */
  public getConfiguration(listenerName: string): IConfiguration {
    const builder = new ConfigurationBuilder();
    for (const { configuration } of this.#configurations) {
      builder.addConfiguration(configuration.getSection(listenerName));
    }
    return builder.build();
  }
}
