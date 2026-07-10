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

import type { IConfiguration } from "@rhombus-std/config";
import type { Ctor, DepSlot, ServiceManifest } from "@rhombus-std/di.core";
import type { IMetricsBuilder, IMetricsListener, MeterScope } from "@rhombus-std/diagnostics.core";
import { augment } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";

// Class-side merge: the metrics augmentation members reach `IMetricsBuilder` via
// diagnostics.core, so this class must declare them to still SATISFY the
// interface. Signatures mirror the diagnostics interface-side merge exactly.
declare module "./metrics-builder" {
  interface MetricsBuilder {
    addMetricsListener(listener: IMetricsListener): this;
    addMetricsListenerType(ctor: Ctor, signatures?: readonly (readonly DepSlot[])[]): this;
    enableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
    disableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
    addMetricsConfiguration(configuration: IConfiguration): this;
  }
}

/** Carries the service-registration surface the metrics extension functions register against. */
@augment(nameof<IMetricsBuilder>())
export class MetricsBuilder implements IMetricsBuilder {
  public readonly services: ServiceManifest;

  public constructor(services: ServiceManifest) {
    this.services = services;
  }
}
