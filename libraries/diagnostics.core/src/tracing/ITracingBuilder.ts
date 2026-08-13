// ITracingBuilder carries the DI registration surface that tracing augmentation
// functions register against -- the tracing counterpart of IMetricsBuilder.
//
// `services` is WRITABLE (not `readonly`): di.core's `Manifest` chain is
// immutable -- every registration verb returns a NEW manifest -- so an
// augmentation function that registers something reassigns
// `builder.services = builder.services.addClass(...)` rather than mutating in place.

import type { Manifest } from '@rhombus-std/di.core';

/** Configures the tracing system by registering listeners and rules. */
export interface ITracingBuilder {
  /** The registration builder that augmentation functions register services against. */
  services: Manifest;
}
