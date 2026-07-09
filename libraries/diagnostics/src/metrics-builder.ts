// MetricsBuilder -- the concrete IMetricsBuilder the addMetrics augmentation hands
// to a consumer's configure callback. Mirrors the reference's private
// `MetricsServiceExtensions.MetricsBuilder`: it holds the service-registration
// surface and nothing else; every capability is an extension function over it
// (@rhombus-std/diagnostics.core's addMetricsListener/enableMetrics/... and this
// package's addMetricsConfiguration).

import type { ServiceManifestBase } from "@rhombus-std/di.core";
import { METRICS_BUILDER_AUGMENTATION_TOKEN } from "@rhombus-std/diagnostics.core";
import type { IMetricsBuilder } from "@rhombus-std/diagnostics.core";
import { augment } from "@rhombus-std/primitives";

/**
 * The concrete {@link IMetricsBuilder}.
 *
 * `@augment` subscribes this class to the OPEN `IMetricsBuilder` bag (docs §38):
 * every set registered against METRICS_BUILDER_AUGMENTATION_TOKEN -- the
 * listener/rule members (diagnostics.core) and the config-binding member (this
 * package) -- is installed onto the prototype, now and on any later registration.
 */
@augment(METRICS_BUILDER_AUGMENTATION_TOKEN)
export class MetricsBuilder implements IMetricsBuilder {
  readonly services: ServiceManifestBase;

  /** @param services The registration surface extension functions register against. */
  public constructor(services: ServiceManifestBase) {
    this.services = services;
  }
}
