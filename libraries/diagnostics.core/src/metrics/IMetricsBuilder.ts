// IMetricsBuilder carries the DI registration surface that metrics augmentation
// functions (addListener/enableMetrics et al.) register services against.
//
// `services` is WRITABLE (not `readonly`): di.core's `Manifest` chain is
// immutable -- every registration verb returns a NEW manifest -- so an
// augmentation function that registers something reassigns
// `builder.services = builder.services.add(...)` rather than mutating in place.

import type { Manifest } from '@rhombus-std/di.core';

/** Configures the metrics system by registering listeners and rules. */
export interface IMetricsBuilder {
  /** The registration builder that augmentation functions register services against. */
  services: Manifest<any>;
}
