// ITracingBuilder -- ported from MED.Tracing's `ITracingBuilder`. The tracing
// analog of IMetricsBuilder; `services` maps the reference `IServiceCollection`
// to di.core's registration surface.
//
// `services` is WRITABLE (not `readonly`): di.core's `ServiceManifest` chain is
// immutable (§di-core-immutable-manifest) -- every registration verb returns a
// NEW manifest -- so an extension function that registers something reassigns
// `builder.services = builder.services.add(...)` rather than mutating in place.

import type { IServiceManifestBase } from '@rhombus-std/di.core';

/**
 * Configures the tracing system by registering listeners and rules. Mirrors
 * MED.Tracing's `ITracingBuilder`.
 */
export interface ITracingBuilder {
  /** The registration builder that extension functions register services against. */
  services: IServiceManifestBase;
}
