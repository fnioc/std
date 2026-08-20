// LoggingBuilder is the concrete ILoggingBuilder: a thin wrapper exposing the
// registration builder as `.services`, handed to the `configure` delegate by
// `addLogging`.
//
// `.services` is an ACCESSOR over a slot, not a field of its own, so the
// builder can be pointed at a slot that something ELSE also writes. `addLogging`
// hands it a private slot (nobody else is looking at that chain); a host
// application builder hands it ITSELF, so `builder.logging.addProvider(...)` and
// `builder.services = builder.services.add(...)` stay on one chain instead of
// forking into two and dropping whichever one `build()` did not read.

import type { Manifest } from '@rhombus-std/di.core';
import type { ILoggingBuilder } from '@rhombus-std/logging.core';
import { augment } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

// Binding the ILoggingBuilder interface onto the class flows every
// augmentation of the interface — this package's `addProvider`/`addFilter`/…,
// plus downstream `addConfig`/`addConsole` — onto this concrete holder, so it
// satisfies `implements ILoggingBuilder` without any class-side restatement.
export interface LoggingBuilder extends ILoggingBuilder {}

// Decorating the concrete builder with the ILoggingBuilder type means every
// set registered against it — this package's `LoggingBuilderProviderAugmentations`, plus
// downstream `addConfig`/`addConsole` — is (re)installed onto the prototype,
// whatever the import order.
@augment(typefor<ILoggingBuilder>())
export class LoggingBuilder implements ILoggingBuilder {
  readonly #slot: ManifestSlot;

  /**
   * Wraps either a bare manifest (a private slot is allocated for it) or an
   * existing {@link ManifestSlot} this builder then SHARES.
   */
  public constructor(services: Manifest<any> | ManifestSlot) {
    this.#slot = isSlot(services) ? services : { services };
  }

  /** The current manifest — read through the shared slot. */
  public get services(): Manifest<any> {
    return this.#slot.services;
  }

  /**
   * Rebinds the shared slot's manifest. The chain is immutable, so every
   * builder augmentation (`addProvider`/`setMinimumLevel`/`clearProviders`, plus
   * downstream `addConfig`/`addConsole`) threads by assigning here and handing
   * the same builder back.
   */
  public set services(value: Manifest<any>) {
    this.#slot.services = value;
  }
}

/** A writable manifest slot two builders can share, so both write one chain. */
export type ManifestSlot = { services: Manifest<any>; };

/** A manifest is never itself a slot: only a slot carries a `services` member. */
function isSlot(value: Manifest<any> | ManifestSlot): value is ManifestSlot {
  return 'services' in value;
}
