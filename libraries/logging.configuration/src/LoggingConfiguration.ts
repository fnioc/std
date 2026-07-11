// LoggingConfiguration — holds the IConfiguration a logging setup was bound
// from, ported from ME.Logging.Configuration's internal `LoggingConfiguration`.
// A plain data holder; registered by `addConfiguration` so a downstream
// consumer can resolve the raw configuration.

import type { IConfiguration } from '@rhombus-std/config.core';

export class LoggingConfiguration {
  public readonly configuration: IConfiguration;

  public constructor(configuration: IConfiguration) {
    this.configuration = configuration;
  }
}
