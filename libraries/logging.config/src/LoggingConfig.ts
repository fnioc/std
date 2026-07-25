import type { IConfig } from '@rhombus-std/config.core';

/** Registered by `addConfig` so a downstream consumer can resolve the raw configuration. */
export class LoggingConfig {
  public readonly config: IConfig;

  public constructor(config: IConfig) {
    this.config = config;
  }
}
