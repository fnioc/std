// TracingBuilder -- the concrete ITracingBuilder the addTracing augmentation hands
// to a consumer's configure callback. Mirrors the reference's private
// `TracingServiceExtensions.TracingBuilder`.

import type { IServiceManifestBase } from '@rhombus-std/di.core';
import type { ITracingBuilder } from '@rhombus-std/diagnostics.core';
import { augment } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';

// Interface-extends merge (augmentation doctrine): binding the ITracingBuilder
// SYMBOL flows every in-program augmentation of the interface (the listener/rule
// members from diagnostics.core, the config-binding member from this package) onto
// this concrete holder, so it satisfies `implements ITracingBuilder` without
// restating any member.
export interface TracingBuilder extends ITracingBuilder {}

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
  // Writable (not `readonly`): registering something reassigns `services` to
  // the new manifest the immutable chain returns (see ITracingBuilder).
  services: IServiceManifestBase;

  /** @param services The registration surface extension functions register against. */
  public constructor(services: IServiceManifestBase) {
    this.services = services;
  }
}
