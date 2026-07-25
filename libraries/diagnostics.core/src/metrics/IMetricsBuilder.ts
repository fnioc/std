// IMetricsBuilder carries the DI registration surface that metrics extension
// functions (addListener/enableMetrics et al.) register services against.
//
// `services` is WRITABLE (not `readonly`): di.core's `ServiceManifest` chain is
// immutable -- every registration verb returns a NEW manifest -- so an
// extension function that registers something reassigns
// `builder.services = builder.services.addClass(...)` rather than mutating in place.

import type { IServiceManifestBase } from '@rhombus-std/di.core';

/** Configures the metrics system by registering listeners and rules. */
export interface IMetricsBuilder {
  /** The registration builder that extension functions register services against. */
  services: IServiceManifestBase;
}
