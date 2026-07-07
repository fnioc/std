// LoggingBuilder — the concrete ILoggingBuilder, ported from ME.Logging's
// internal `LoggingBuilder`. A thin wrapper exposing the registration builder
// as `.services`, handed to the `configure` delegate by `addLogging`.

import type { ServiceManifest } from "@rhombus-std/di.core";
import type { ILoggingBuilder } from "@rhombus-std/logging.core";

export class LoggingBuilder implements ILoggingBuilder {
  public readonly services: ServiceManifest;

  public constructor(services: ServiceManifest) {
    this.services = services;
  }
}
