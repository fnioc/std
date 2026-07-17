// MetricsBuilder -- the concrete IMetricsBuilder the addMetrics augmentation hands
// to a consumer's configure callback. Mirrors the reference's private
// `MetricsServiceExtensions.MetricsBuilder`: it holds the service-registration
// surface and nothing else; every capability is an extension function over it
// (@rhombus-std/diagnostics.core's addMetricsListener/enableMetrics/... and this
// package's addMetricsConfig).

import type { IServiceManifestBase } from '@rhombus-std/di.core';
import type { IMetricsBuilder } from '@rhombus-std/diagnostics.core';
import { augment } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';

// Interface-extends merge (augmentation doctrine): binding the IMetricsBuilder
// SYMBOL flows every in-program augmentation of the interface (the listener/rule
// members from diagnostics.core, the config-binding member from this package) onto
// this concrete holder, so it satisfies `implements IMetricsBuilder` without
// restating any member.
export interface MetricsBuilder extends IMetricsBuilder {}

/**
 * The concrete {@link IMetricsBuilder}.
 *
 * `@augment` subscribes this class to the OPEN `IMetricsBuilder` bag (docs §38):
 * every set registered against nameof<IMetricsBuilder>() -- the
 * listener/rule members (diagnostics.core) and the config-binding member (this
 * package) -- is installed onto the prototype, now and on any later registration.
 */
@augment(nameof<IMetricsBuilder>())
export class MetricsBuilder implements IMetricsBuilder {
  readonly services: IServiceManifestBase;

  /** @param services The registration surface extension functions register against. */
  public constructor(services: IServiceManifestBase) {
    this.services = services;
  }
}
