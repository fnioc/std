// TracingConfig -- ported from MED.Tracing's internal
// `TracingConfig`. The tracing twin of ../../metrics/configuration's
// MetricsConfig: the marker `addTracingConfiguration` registers (one per
// call, as a TRACING_CONFIGURATION_TOKEN collection value) so
// DefaultActivityListenerConfigFactory can enumerate every configuration
// bound to tracing and merge their per-listener sections. Internal in the
// reference; exported here so a plugin-less consumer wiring the config path by
// hand can register one directly.

import type { IConfig } from '@rhombus-std/config';

/** Marks an {@link IConfig} as bound to tracing via `addTracingConfiguration`. */
export class TracingConfig {
  /** The configuration section `addTracingConfiguration` was given. */
  public readonly configuration: IConfig;

  /** @param configuration The configuration section bound to tracing. */
  public constructor(configuration: IConfig) {
    this.configuration = configuration;
  }
}
