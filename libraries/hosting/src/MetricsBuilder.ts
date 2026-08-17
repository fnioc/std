// MetricsBuilder -- the concrete IMetricsBuilder. A thin wrapper exposing the
// registration builder as `.services`, exactly like
// {@link import("@rhombus-std/logging").LoggingBuilder}.
//
// This is a SECOND concrete `IMetricsBuilder` alongside `@rhombus-std/diagnostics`'s
// own `MetricsBuilder`; both share the `IMetricsBuilder` receiver, so this class is
// decorated with `@augment(typefor<IMetricsBuilder>())` to pull the metrics
// augmentation bag (`addMetricsListener`/`enableMetrics`/... registered by the
// diagnostics family) onto its prototype -- otherwise a host's `builder.metrics`
// would never receive `enableMetrics`. The class-side merge below keeps this
// class satisfying `IMetricsBuilder` once diagnostics.core merges those members
// onto the interface.

import type { Manifest } from '@rhombus-std/di.core';
import type { IMetricsBuilder } from '@rhombus-std/diagnostics.core';
import { augment } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

// Interface-extends merge (augmentation doctrine): the metrics augmentation
// members reach `IMetricsBuilder` via diagnostics.core's interface-side merge;
// binding the interface SYMBOL here flows all of them (and every future one) onto
// this concrete holder, so it satisfies `implements IMetricsBuilder` without
// restating a member.
export interface MetricsBuilder extends IMetricsBuilder {}

/** Carries the service-registration surface the metrics augmentation functions register against. */
@augment(typefor<IMetricsBuilder>())
export class MetricsBuilder implements IMetricsBuilder {
  readonly #holder: ManifestSlot;

  /**
   * Wraps either a bare manifest (a private holder is allocated for it) or an
   * existing {@link ManifestSlot} whose slot this builder then SHARES
   * -- the host application builder passes ITSELF, so `builder.metrics`
   * registrations and `builder.services` registrations stay on one chain.
   */
  public constructor(services: Manifest<any> | ManifestSlot) {
    this.#holder = isHolder(services) ? services : { services };
  }

  /** The current manifest -- read through the shared holder. */
  public get services(): Manifest<any> {
    return this.#holder.services;
  }

  /**
   * Rebinds the shared holder's manifest. The chain is immutable, so every
   * metrics augmentation threads by assigning here.
   */
  public set services(value: Manifest<any>) {
    this.#holder.services = value;
  }
}

/** A manifest is never itself a holder: only a holder carries a `services` slot. */
function isHolder(value: Manifest<any> | ManifestSlot): value is ManifestSlot {
  return 'services' in value;
}

/** A writable manifest slot two builders can share, so both write one chain. */
export type ManifestSlot = { services: Manifest<any>; };
