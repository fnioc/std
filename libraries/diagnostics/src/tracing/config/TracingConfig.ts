import type { IConfig } from '@rhombus-std/config.core';

/** Marks an {@link IConfig} as bound to tracing via `addTracingConfig`. */
export class TracingConfig {
  /** The configuration section `addTracingConfig` was given. */
  public readonly config: IConfig;

  public constructor(config: IConfig) {
    this.config = config;
  }
}
