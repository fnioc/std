// IMetricListenerConfigurationFactory -- ported from MED.Metrics's
// `IMetricListenerConfigurationFactory`. Lives in this package (not
// diagnostics.core) because it speaks `IConfiguration` and diagnostics.core is
// config-unaware -- same placement as the reference, whose interface sits in
// the implementation project, not the abstractions one.

import type { IConfiguration } from '@rhombus-std/config';

/** Retrieves the metrics configuration for any listener name. */
export interface IMetricListenerConfigurationFactory {
  /**
   * Gets the configuration for the given listener -- the merge of every
   * `{listenerName}` section across the configurations registered through
   * `addMetricsConfiguration`, later registrations winning on key conflicts.
   *
   * @param listenerName The name of the listener.
   * @returns The configuration for this listener type.
   */
  getConfiguration(listenerName: string): IConfiguration;
}
