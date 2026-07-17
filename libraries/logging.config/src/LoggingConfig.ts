// LoggingConfig — holds the IConfig a logging setup was bound
// from, ported from ME.Logging.Configuration's internal `LoggingConfig`.
// A plain data holder; registered by `addConfig` so a downstream
// consumer can resolve the raw configuration.

import type { IConfig } from '@rhombus-std/config.core';

export class LoggingConfig {
  public readonly config: IConfig;

  public constructor(config: IConfig) {
    this.config = config;
  }
}
