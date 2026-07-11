// TracingConfiguration -- ported from MED.Tracing's internal
// `TracingConfiguration`. The tracing twin of ../../Metrics/Configuration's
// MetricsConfiguration: the marker `addTracingConfiguration` registers (one per
// call, as a TRACING_CONFIGURATION_TOKEN collection value) so
// DefaultActivityListenerConfigurationFactory can enumerate every configuration
// bound to tracing and merge their per-listener sections. Internal in the
// reference; exported here so a plugin-less consumer wiring the config path by
// hand can register one directly.

import type { IConfiguration } from "@rhombus-std/config";

/** Marks an {@link IConfiguration} as bound to tracing via `addTracingConfiguration`. */
export class TracingConfiguration {
  /** The configuration section `addTracingConfiguration` was given. */
  public readonly configuration: IConfiguration;

  /** @param configuration The configuration section bound to tracing. */
  public constructor(configuration: IConfiguration) {
    this.configuration = configuration;
  }
}
