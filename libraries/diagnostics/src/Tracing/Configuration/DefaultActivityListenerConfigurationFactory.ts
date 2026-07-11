// DefaultActivityListenerConfigurationFactory -- ported from MED.Tracing's
// internal `DefaultActivityListenerConfigurationFactory`. The concrete
// ActivityListenerConfigurationFactory `addTracing` registers: it takes every
// TracingConfiguration marker registered through `addTracingConfiguration` (the
// TRACING_CONFIGURATION_TOKEN collection, ctor-injected) and, per listener name,
// chains each configuration's `{listenerName}` section into one merged view --
// later registrations win on key conflicts, matching provider order. Internal in
// the reference; exported here so a plugin-less consumer can construct one over
// hand-registered markers.

import { ConfigurationBuilder, type IConfiguration } from "@rhombus-std/config";

import { ActivityListenerConfigurationFactory } from "./ActivityListenerConfigurationFactory";
import type { TracingConfiguration } from "./TracingConfiguration";

/** The concrete {@link ActivityListenerConfigurationFactory}. */
export class DefaultActivityListenerConfigurationFactory extends ActivityListenerConfigurationFactory {
  readonly #configurations: Iterable<TracingConfiguration>;

  /** @param configurations Every registered {@link TracingConfiguration} marker. */
  public constructor(configurations: Iterable<TracingConfiguration>) {
    super();
    this.#configurations = configurations;
  }

  /** Merges every registered configuration's `listenerName` section into one view. */
  public override getConfiguration(listenerName: string): IConfiguration {
    const builder = new ConfigurationBuilder();
    for (const { configuration } of this.#configurations) {
      builder.addConfiguration(configuration.getSection(listenerName));
    }
    return builder.build();
  }
}
