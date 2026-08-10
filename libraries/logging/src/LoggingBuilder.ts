// LoggingBuilder is the concrete ILoggingBuilder: a thin wrapper exposing the
// registration builder as `.services`, handed to the `configure` delegate by
// `addLogging`.
//
// `.services` is an ACCESSOR over a holder, not a field of its own, so the
// builder can be pointed at a slot that something ELSE also writes. `addLogging`
// hands it a private holder (nobody else is looking at that chain); a host
// application builder hands it ITSELF, so `builder.logging.addProvider(...)` and
// `builder.services = builder.services.addClass(...)` stay on one chain instead of
// forking into two and dropping whichever one `build()` did not read.

import type { IServiceManifestHolder, Manifest } from '@rhombus-std/di2.core';
import type { ILoggingBuilder } from '@rhombus-std/logging.core';
import { augment } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';

// Binding the ILoggingBuilder interface onto the class flows every
// augmentation of the interface — this package's `addProvider`/`addFilter`/…,
// plus downstream `addConfig`/`addConsole` — onto this concrete holder, so it
// satisfies `implements ILoggingBuilder` without any class-side restatement.
export interface LoggingBuilder extends ILoggingBuilder {}

// Decorating the concrete builder with the ILoggingBuilder token means every
// set registered against it — this package's `LoggingBuilderProviderAugmentations`, plus
// downstream `addConfig`/`addConsole` — is (re)installed onto the prototype,
// whatever the import order.
@augment(tokenfor<ILoggingBuilder>())
export class LoggingBuilder implements ILoggingBuilder {
  readonly #holder: IServiceManifestHolder;

  /**
   * Wraps either a bare manifest (a private holder is allocated for it) or an
   * existing {@link IServiceManifestHolder} whose slot this builder then SHARES.
   */
  public constructor(services: Manifest | IServiceManifestHolder) {
    this.#holder = isHolder(services) ? services : { services };
  }

  /** The current manifest — read through the shared holder. */
  public get services(): Manifest {
    return this.#holder.services;
  }

  /**
   * Rebinds the shared holder's manifest. The chain is immutable, so every
   * builder augmentation (`addProvider`/`setMinimumLevel`/`clearProviders`, plus
   * downstream `addConfig`/`addConsole`) threads by assigning here and handing
   * the same builder back.
   */
  public set services(value: Manifest) {
    this.#holder.services = value;
  }
}

/** A manifest is never itself a holder: only a holder carries a `services` slot. */
function isHolder(value: Manifest | IServiceManifestHolder): value is IServiceManifestHolder {
  return 'services' in value;
}
