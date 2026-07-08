// MetricsBuilder -- the concrete IMetricsBuilder, ported from the private
// `MetricsBuilder` the reference hosting runtime nests inside
// `HostApplicationBuilder`. A thin wrapper exposing the registration builder as
// `.services`, exactly like {@link import("@rhombus-std/logging").LoggingBuilder}.

import type { ServiceManifest } from "@rhombus-std/di.core";
import type { IMetricsBuilder } from "@rhombus-std/diagnostics.core";

/** Carries the service-registration surface the metrics extension functions register against. */
export class MetricsBuilder implements IMetricsBuilder {
  public readonly services: ServiceManifest;

  public constructor(services: ServiceManifest) {
    this.services = services;
  }
}
