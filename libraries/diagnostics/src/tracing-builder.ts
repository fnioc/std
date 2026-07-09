// TracingBuilder -- the concrete ITracingBuilder the addTracing augmentation hands
// to a consumer's configure callback. Mirrors the reference's private
// `TracingServiceExtensions.TracingBuilder`.

import type { ServiceManifestBase } from "@rhombus-std/di.core";
import { TRACING_BUILDER_AUGMENTATION_TOKEN } from "@rhombus-std/diagnostics.core";
import type { ITracingBuilder } from "@rhombus-std/diagnostics.core";
import { augment } from "@rhombus-std/primitives";

/**
 * The concrete {@link ITracingBuilder}.
 *
 * `@augment` subscribes this class to the OPEN `ITracingBuilder` bag (docs §38):
 * every set registered against TRACING_BUILDER_AUGMENTATION_TOKEN -- the
 * listener/rule members (diagnostics.core) and the config-binding member (this
 * package) -- is installed onto the prototype, now and on any later registration.
 */
@augment(TRACING_BUILDER_AUGMENTATION_TOKEN)
export class TracingBuilder implements ITracingBuilder {
  readonly services: ServiceManifestBase;

  /** @param services The registration surface extension functions register against. */
  public constructor(services: ServiceManifestBase) {
    this.services = services;
  }
}
