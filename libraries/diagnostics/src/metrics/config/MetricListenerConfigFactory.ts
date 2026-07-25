import { ConfigBuilder } from '@rhombus-std/config';
import type { IConfig } from '@rhombus-std/config.core';

import type { IMetricListenerConfigFactory } from './IMetricListenerConfigFactory';
import type { MetricsConfig } from './MetricsConfig';

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
