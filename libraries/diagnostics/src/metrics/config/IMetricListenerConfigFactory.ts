import type { IConfig } from '@rhombus-std/config.core';

/** Retrieves the merged {@link IConfig} for a named metrics listener. */
export interface IMetricListenerConfigFactory {
  /**
   * @remarks
   * Merges every `{listenerName}` section across configurations registered
   * through `addMetricsConfig`, later registrations winning on conflicts.
   */
  getConfig(listenerName: string): IConfig;
}
