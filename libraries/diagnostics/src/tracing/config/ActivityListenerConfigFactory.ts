// ActivityListenerConfigFactory -- ported from MED.Tracing's
// `ActivityListenerConfigFactory`. The tracing twin of
// IMetricListenerConfigFactory, except the reference shapes it as a
// public ABSTRACT CLASS (not an interface) -- mirrored faithfully, so a
// consumer resolves and extends the same shape the reference exposes.

import type { IConfig } from '@rhombus-std/config';

/**
 * Resolves an {@link IConfig} view for a named activity listener.
 *
 * Implementations merge every configuration section registered through
 * `addTracingConfiguration` that targets the supplied listener name, returning
 * a single merged {@link IConfig} instance per call.
 */
export abstract class ActivityListenerConfigFactory {
  /**
   * Gets the merged {@link IConfig} for the listener identified by
   * `listenerName` -- the aggregate of every section registered for it.
   *
   * @param listenerName The name of the listener whose configuration is requested.
   */
  public abstract getConfiguration(listenerName: string): IConfig;
}
