// TracingBuilder -- the concrete ITracingBuilder the addTracing augmentation hands
// to a consumer's configure callback. Mirrors the reference's private
// `TracingServiceExtensions.TracingBuilder`.

import type { ServiceManifestBase } from "@rhombus-std/di.core";
import type { ITracingBuilder } from "@rhombus-std/diagnostics.core";
import { augment } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";

/**
 * The concrete {@link ITracingBuilder}.
 *
 * `@augment` subscribes this class to the OPEN `ITracingBuilder` bag (docs §38):
 * every set registered against nameof<ITracingBuilder>() -- the
 * listener/rule members (diagnostics.core) and the config-binding member (this
 * package) -- is installed onto the prototype, now and on any later registration.
 */
@augment(nameof<ITracingBuilder>())
export class TracingBuilder implements ITracingBuilder {
  readonly services: ServiceManifestBase;

  /** @param services The registration surface extension functions register against. */
  public constructor(services: ServiceManifestBase) {
    this.services = services;
  }
}
