// LoggingBuilder — the concrete ILoggingBuilder, ported from ME.Logging's
// internal `LoggingBuilder`. A thin wrapper exposing the registration builder
// as `.services`, handed to the `configure` delegate by `addLogging`.

import type { ServiceManifest } from '@rhombus-std/di.core';
import type { ILoggingBuilder } from '@rhombus-std/logging.core';
import { augment } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives.transformer/internal/nameof';

// Interface-extends merge (augmentation doctrine): binding the ILoggingBuilder
// SYMBOL flows every in-program augmentation of the interface — this package's
// `addProvider`/`addFilter`/…, plus downstream `addConfiguration`/`addConsole` —
// onto this concrete holder, so it satisfies `implements ILoggingBuilder` without
// any class-side restatement of members.
export interface LoggingBuilder extends ILoggingBuilder {}

// OPEN receiver (docs §38): decorate the concrete builder with the ILoggingBuilder
// augmentation token — derived inline by `nameof<ILoggingBuilder>()`, lowered at
// build time — so every set registered against it — this package's
// `LoggingBuilderExtensions`, plus downstream `addConfiguration`/`addConsole` — is
// (re)installed onto the prototype, whatever the import order.
@augment(nameof<ILoggingBuilder>())
export class LoggingBuilder implements ILoggingBuilder {
  public readonly services: ServiceManifest;

  public constructor(services: ServiceManifest) {
    this.services = services;
  }
}
