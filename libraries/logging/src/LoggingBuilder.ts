// LoggingBuilder — the concrete ILoggingBuilder, ported from ME.Logging's
// internal `LoggingBuilder`. A thin wrapper exposing the registration builder
// as `.services`, handed to the `configure` delegate by `addLogging`.
//
// `.services` is an ACCESSOR over a holder, not a field of its own, so the
// builder can be pointed at a slot that something ELSE also writes. `addLogging`
// hands it a private holder (nobody else is looking at that chain); a host
// application builder hands it ITSELF, so `builder.logging.addProvider(...)` and
// `builder.services = builder.services.addClass(...)` stay on one chain instead of
// forking into two and dropping whichever one `build()` did not read.

import type { IServiceManifest, IServiceManifestHolder } from '@rhombus-std/di.core';
import type { ILoggingBuilder } from '@rhombus-std/logging.core';
import { augment } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';

// Interface-extends merge (augmentation doctrine): binding the ILoggingBuilder
// SYMBOL flows every in-program augmentation of the interface — this package's
// `addProvider`/`addFilter`/…, plus downstream `addConfig`/`addConsole` —
// onto this concrete holder, so it satisfies `implements ILoggingBuilder` without
// any class-side restatement of members.
export interface LoggingBuilder extends ILoggingBuilder {}

// OPEN receiver (docs §38): decorate the concrete builder with the ILoggingBuilder
// augmentation token — derived inline by `nameof<ILoggingBuilder>()`, lowered at
// build time — so every set registered against it — this package's
// `LoggingBuilderExtensions`, plus downstream `addConfig`/`addConsole` — is
// (re)installed onto the prototype, whatever the import order.
@augment(nameof<ILoggingBuilder>())
export class LoggingBuilder implements ILoggingBuilder {
  readonly #holder: IServiceManifestHolder;

  /**
   * Wraps either a bare manifest (a private holder is allocated for it) or an
   * existing {@link IServiceManifestHolder} whose slot this builder then SHARES.
   */
  public constructor(services: IServiceManifest | IServiceManifestHolder) {
    this.#holder = isHolder(services) ? services : { services };
  }

  /** The current manifest — read through the shared holder. */
  public get services(): IServiceManifest {
    return this.#holder.services;
  }

  /**
   * Rebinds the shared holder's manifest. The chain is immutable, so every
   * builder augmentation (`addProvider`/`setMinimumLevel`/`clearProviders`, plus
   * downstream `addConfig`/`addConsole`) threads by assigning here and handing
   * the same builder back.
   */
  public set services(value: IServiceManifest) {
    this.#holder.services = value;
  }
}

/** A manifest is never itself a holder: only a holder carries a `services` slot. */
function isHolder(value: IServiceManifest | IServiceManifestHolder): value is IServiceManifestHolder {
  return 'services' in value;
}
