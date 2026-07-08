// TracingBuilder -- the concrete ITracingBuilder the addTracing augmentation hands
// to a consumer's configure callback. Mirrors the reference's private
// `TracingServiceExtensions.TracingBuilder`.

import type { ServiceManifestBase } from "@rhombus-std/di.core";
import type { ITracingBuilder } from "@rhombus-std/diagnostics.core";

/** The concrete {@link ITracingBuilder}. */
export class TracingBuilder implements ITracingBuilder {
  readonly services: ServiceManifestBase;

  /** @param services The registration surface extension functions register against. */
  public constructor(services: ServiceManifestBase) {
    this.services = services;
  }
}
