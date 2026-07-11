// ITracingBuilder -- ported from MED.Tracing's `ITracingBuilder`. The tracing
// analog of IMetricsBuilder; `services` maps the reference `IServiceCollection`
// to di.core's registration surface.

import type { ServiceManifestBase } from '@rhombus-std/di.core';

/**
 * Configures the tracing system by registering listeners and rules. Mirrors
 * MED.Tracing's `ITracingBuilder`.
 */
export interface ITracingBuilder {
  /** The registration builder that extension functions register services against. */
  readonly services: ServiceManifestBase;
}
