import { ConfigBuilder } from '@rhombus-std/config';
import type { IConfig } from '@rhombus-std/config.core';

import { ActivityListenerConfigFactory } from './ActivityListenerConfigFactory';
import type { TracingConfig } from './TracingConfig';

export class DefaultActivityListenerConfigFactory extends ActivityListenerConfigFactory {
  readonly #configs: Iterable<TracingConfig>;

  /** @param configs Every registered {@link TracingConfig} marker. */
  public constructor(configs: Iterable<TracingConfig>) {
    super();
    this.#configs = configs;
  }

  /** Merges every registered configuration's `listenerName` section into one view. */
  public override getConfig(listenerName: string): IConfig {
    const builder = new ConfigBuilder();
    for (const { config } of this.#configs) {
      builder.addConfig(config.getSection(listenerName));
    }
    return builder.build();
  }
}
