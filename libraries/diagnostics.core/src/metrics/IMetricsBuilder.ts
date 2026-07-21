// IMetricsBuilder -- ported from MED.Metrics's `IMetricsBuilder`.
//
// The reference interface exposes `IServiceCollection Services { get; }`; the
// @rhombus-std analog of `IServiceCollection` is di.core's registration builder
// surface `IServiceManifestBase`. Extension methods (AddListener/EnableMetrics)
// register services against `services`.
//
// `services` is WRITABLE (not `readonly`): di.core's `ServiceManifest` chain is
// immutable (§di-core-immutable-manifest) -- every registration verb returns a
// NEW manifest -- so an extension function that registers something reassigns
// `builder.services = builder.services.add(...)` rather than mutating in place.

import type { IServiceManifestBase } from '@rhombus-std/di.core';

/**
 * Configures the metrics system by registering listeners and rules. Mirrors
 * MED.Metrics's `IMetricsBuilder`: it carries the service-registration surface
 * that the metrics extension functions register against.
 */
export interface IMetricsBuilder {
  /** The registration builder that extension functions register services against. */
  services: IServiceManifestBase;
}
