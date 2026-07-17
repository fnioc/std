// IMetricListenerConfigFactory -- ported from MED.Metrics's
// `IMetricListenerConfigFactory`. Lives in this package (not
// diagnostics.core) because it speaks `IConfig` and diagnostics.core is
// config-unaware -- same placement as the reference, whose interface sits in
// the implementation project, not the abstractions one.

import type { IConfig } from '@rhombus-std/config';

/** Retrieves the metrics configuration for any listener name. */
export interface IMetricListenerConfigFactory {
  /**
   * Gets the configuration for the given listener -- the merge of every
   * `{listenerName}` section across the configurations registered through
   * `addMetricsConfig`, later registrations winning on key conflicts.
   *
   * @param listenerName The name of the listener.
   * @returns The configuration for this listener type.
   */
  getConfig(listenerName: string): IConfig;
}
