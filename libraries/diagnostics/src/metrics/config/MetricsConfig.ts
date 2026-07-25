import type { IConfig } from '@rhombus-std/config.core';

/** Marks an {@link IConfig} as bound to metrics via `addMetricsConfig`. */
export class MetricsConfig {
  /** The configuration section `addMetricsConfig` was given. */
  public readonly config: IConfig;

  public constructor(config: IConfig) {
    this.config = config;
  }
}
