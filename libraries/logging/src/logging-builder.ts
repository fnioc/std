// LoggingBuilder — the concrete ILoggingBuilder, ported from ME.Logging's
// internal `LoggingBuilder`. A thin wrapper exposing the registration builder
// as `.services`, handed to the `configure` delegate by `addLogging`.

import type { ServiceManifest } from "@rhombus-std/di.core";
import { LOGGING_BUILDER_AUGMENTATION_TOKEN } from "@rhombus-std/logging.core";
import type { ILoggingBuilder } from "@rhombus-std/logging.core";
import { augment } from "@rhombus-std/primitives";

// OPEN receiver (docs §38): decorate the concrete builder with the ILoggingBuilder
// augmentation token so every set registered against it — this package's
// `LoggingBuilderExtensions`, plus downstream `addConfiguration`/`addConsole` — is
// (re)installed onto the prototype, whatever the import order.
@augment(LOGGING_BUILDER_AUGMENTATION_TOKEN)
export class LoggingBuilder implements ILoggingBuilder {
  public readonly services: ServiceManifest;

  public constructor(services: ServiceManifest) {
    this.services = services;
  }
}
