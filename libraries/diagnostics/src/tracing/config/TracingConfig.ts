// TracingConfig -- ported from MED.Tracing's internal
// `TracingConfig`. The tracing twin of ../../metrics/config's
// MetricsConfig: the marker `addTracingConfig` registers (one per
// call, as a TRACING_CONFIGURATION_TOKEN collection value) so
// DefaultActivityListenerConfigFactory can enumerate every configuration
// bound to tracing and merge their per-listener sections. Internal in the
// reference; exported here so a plugin-less consumer wiring the config path by
// hand can register one directly.

import type { IConfig } from '@rhombus-std/config.core';

/** Marks an {@link IConfig} as bound to tracing via `addTracingConfig`. */
export class TracingConfig {
  /** The configuration section `addTracingConfig` was given. */
  public readonly config: IConfig;

  /** @param config The configuration section bound to tracing. */
  public constructor(config: IConfig) {
    this.config = config;
  }
}
