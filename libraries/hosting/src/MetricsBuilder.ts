// MetricsBuilder -- the concrete IMetricsBuilder, ported from the private
// `MetricsBuilder` the reference hosting runtime nests inside
// `HostApplicationBuilder`. A thin wrapper exposing the registration builder as
// `.services`, exactly like {@link import("@rhombus-std/logging").LoggingBuilder}.
//
// This is a SECOND concrete `IMetricsBuilder` alongside `@rhombus-std/diagnostics`'s
// own `MetricsBuilder`; both share the `IMetricsBuilder` receiver, so this class is
// decorated with `@augment(nameof<IMetricsBuilder>())` (docs §38) to pull
// the metrics augmentation bag (`addMetricsListener`/`enableMetrics`/... registered
// by the diagnostics family) onto its prototype -- otherwise a host's `builder.metrics`
// would never receive `enableMetrics`. The class-side merge below keeps this class
// satisfying `IMetricsBuilder` once diagnostics.core merges those members onto the
// interface (rule 0.6).

import type { IServiceManifest } from '@rhombus-std/di.core';
import type { IMetricsBuilder } from '@rhombus-std/diagnostics.core';
import { augment } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';

// Interface-extends merge (augmentation doctrine): the metrics augmentation
// members reach `IMetricsBuilder` via diagnostics.core's interface-side merge;
// binding the interface SYMBOL here flows all of them (and every future one) onto
// this concrete holder, so it satisfies `implements IMetricsBuilder` without
// restating a member.
export interface MetricsBuilder extends IMetricsBuilder {}

/** Carries the service-registration surface the metrics extension functions register against. */
@augment(nameof<IMetricsBuilder>())
export class MetricsBuilder implements IMetricsBuilder {
  public readonly services: IServiceManifest;

  public constructor(services: IServiceManifest) {
    this.services = services;
  }
}
