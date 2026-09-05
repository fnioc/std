// MetricsBuilder -- the concrete IMetricsBuilder the addMetrics augmentation hands
// to a consumer's configure callback. It holds the service-registration surface
// and nothing else; every capability is an augmentation function over it
// (@rhombus-std/diagnostics.core's addMetricsListener/enableMetrics/... and this
// package's addMetricsConfig).

import type { Manifest } from '@rhombus-std/di.core';
import type { IMetricsBuilder } from '@rhombus-std/diagnostics.core';
import { augment } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import { Func } from '@rhombus-toolkit/types';

// Interface-extends merge: binding the IMetricsBuilder SYMBOL flows every
// in-program augmentation of the interface (the listener/rule members from
// diagnostics.core, the config-binding member from this package) onto this
// concrete holder, so it satisfies `implements IMetricsBuilder` without
// restating any member.
export interface MetricsBuilder extends IMetricsBuilder {}

/**
 * The concrete {@link IMetricsBuilder}.
 *
 * `@augment` subscribes this class to the OPEN `IMetricsBuilder` bag: every set
 * registered against typefor<IMetricsBuilder>() -- the listener/rule members
 * (diagnostics.core) and the config-binding member (this package) -- is
 * installed onto the prototype, now and on any later registration.
 */
@augment(typefor<IMetricsBuilder>())
export class MetricsBuilder implements IMetricsBuilder {
  // Writable (not `readonly`): registering something reassigns `services` to
  // the new manifest the immutable chain returns (see IMetricsBuilder).
  services: Manifest<unknown>;

  /** @param services The registration surface augmentation functions register against. */
  public constructor(services: Manifest<unknown>) {
    this.services = services;
  }
  static run<Lifetime>(manifest: Manifest<Lifetime>, configure?: Func<[IMetricsBuilder], void>) {
    const builder = new MetricsBuilder(manifest as any);
    configure?.(builder);
    return builder.services as typeof manifest;
  }
}
