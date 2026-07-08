// IMetricsBuilder -- ported from MED.Metrics's `IMetricsBuilder`.
//
// The reference interface exposes `IServiceCollection Services { get; }`; the
// @rhombus-std analog of `IServiceCollection` is di.core's registration builder
// surface `ServiceManifestBase`. Extension methods (AddListener/EnableMetrics)
// register services against `services`.

import type { ServiceManifestBase } from "@rhombus-std/di.core";

/**
 * Configures the metrics system by registering listeners and rules. Mirrors
 * MED.Metrics's `IMetricsBuilder`: it carries the service-registration surface
 * that the metrics extension functions register against.
 */
export interface IMetricsBuilder {
  /** The registration builder that extension functions register services against. */
  readonly services: ServiceManifestBase;
}
