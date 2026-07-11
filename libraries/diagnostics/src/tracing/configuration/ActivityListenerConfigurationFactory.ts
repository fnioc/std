// ActivityListenerConfigurationFactory -- ported from MED.Tracing's
// `ActivityListenerConfigurationFactory`. The tracing twin of
// IMetricListenerConfigurationFactory, except the reference shapes it as a
// public ABSTRACT CLASS (not an interface) -- mirrored faithfully, so a
// consumer resolves and extends the same shape the reference exposes.

import type { IConfiguration } from '@rhombus-std/config';

/**
 * Resolves an {@link IConfiguration} view for a named activity listener.
 *
 * Implementations merge every configuration section registered through
 * `addTracingConfiguration` that targets the supplied listener name, returning
 * a single merged {@link IConfiguration} instance per call.
 */
export abstract class ActivityListenerConfigurationFactory {
  /**
   * Gets the merged {@link IConfiguration} for the listener identified by
   * `listenerName` -- the aggregate of every section registered for it.
   *
   * @param listenerName The name of the listener whose configuration is requested.
   */
  public abstract getConfiguration(listenerName: string): IConfiguration;
}
