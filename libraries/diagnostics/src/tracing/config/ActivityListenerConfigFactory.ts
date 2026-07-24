import type { IConfig } from '@rhombus-std/config.core';

/**
 * Resolves a merged {@link IConfig} view for a named activity listener.
 *
 * @remarks
 * An abstract class rather than an interface, so a consumer can extend it directly.
 */
export abstract class ActivityListenerConfigFactory {
  /**
   * @remarks
   * Merges every configuration section registered through `addTracingConfig`
   * that targets `listenerName` into one view.
   */
  public abstract getConfig(listenerName: string): IConfig;
}
