// MetricsBuilder -- the concrete IMetricsBuilder the addMetrics augmentation hands
// to a consumer's configure callback. Mirrors the reference's private
// `MetricsServiceExtensions.MetricsBuilder`: it holds the service-registration
// surface and nothing else; every capability is an extension function over it
// (@rhombus-std/diagnostics.core's addMetricsListener/enableMetrics/... and this
// package's addMetricsConfiguration).

import type { ServiceManifestBase } from "@rhombus-std/di.core";
import type { IMetricsBuilder } from "@rhombus-std/diagnostics.core";

/** The concrete {@link IMetricsBuilder}. */
export class MetricsBuilder implements IMetricsBuilder {
  readonly services: ServiceManifestBase;

  /** @param services The registration surface extension functions register against. */
  public constructor(services: ServiceManifestBase) {
    this.services = services;
  }
}
