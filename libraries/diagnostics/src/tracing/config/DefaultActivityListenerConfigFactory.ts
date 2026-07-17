// DefaultActivityListenerConfigFactory -- ported from MED.Tracing's
// internal `DefaultActivityListenerConfigFactory`. The concrete
// ActivityListenerConfigFactory `addTracing` registers: it takes every
// TracingConfig marker registered through `addTracingConfig` (the
// TRACING_CONFIGURATION_TOKEN collection, ctor-injected) and, per listener name,
// chains each configuration's `{listenerName}` section into one merged view --
// later registrations win on key conflicts, matching provider order. Internal in
// the reference; exported here so a plugin-less consumer can construct one over
// hand-registered markers.

import { ConfigBuilder, type IConfig } from '@rhombus-std/config';

import { ActivityListenerConfigFactory } from './ActivityListenerConfigFactory';
import type { TracingConfig } from './TracingConfig';

/** The concrete {@link ActivityListenerConfigFactory}. */
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
