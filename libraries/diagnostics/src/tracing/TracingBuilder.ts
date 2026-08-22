// TracingBuilder -- the concrete ITracingBuilder the addTracing augmentation hands
// to a consumer's configure callback.

import type { Manifest } from '@rhombus-std/di.core';
import type { ITracingBuilder } from '@rhombus-std/diagnostics.core';
import { augment } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

// Interface-extends merge: binding the ITracingBuilder SYMBOL flows every
// in-program augmentation of the interface (the listener/rule members from
// diagnostics.core, the config-binding member from this package) onto this
// concrete holder, so it satisfies `implements ITracingBuilder` without
// restating any member.
export interface TracingBuilder extends ITracingBuilder {}

/**
 * The concrete {@link ITracingBuilder}.
 *
 * `@augment` subscribes this class to the OPEN `ITracingBuilder` bag: every set
 * registered against typefor<ITracingBuilder>() -- the listener/rule members
 * (diagnostics.core) and the config-binding member (this package) -- is
 * installed onto the prototype, now and on any later registration.
 */
@augment(typefor<ITracingBuilder>())
export class TracingBuilder implements ITracingBuilder {
  // Writable (not `readonly`): registering something reassigns `services` to
  // the new manifest the immutable chain returns (see ITracingBuilder).
  services: Manifest<unknown>;

  /** @param services The registration surface augmentation functions register against. */
  public constructor(services: Manifest<unknown>) {
    this.services = services;
  }
}
