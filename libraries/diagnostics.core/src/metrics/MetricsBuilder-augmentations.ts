// The builder-targeted listener/rule methods for IMetricsBuilder, an OPEN
// receiver whose concrete classes live downstream (@rhombus-std/diagnostics'
// MetricsBuilder and @rhombus-std/hosting's independent one, both decorated with
// the same type). The MetricsOptions-targeted mutators of the same names are
// the sibling ./MetricsOptions-augmentations set.

// Type-only: puts di.extras' declare-module sugar faces in the program with
// no runtime import of the authoring package.
import type {} from '@rhombus-std/di.extras';

import type { IConfigureOptions } from '@rhombus-std/options';
import type { ConstructorType } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Flatten, Func } from '@rhombus-toolkit/types';

import type { IMetricsBuilder } from './IMetricsBuilder';
import { METER_SCOPE_ALL, MeterScope } from './MeterScope';
import type { IMetricsListener } from './metrics-listener';
import { MetricsOptions } from './MetricsOptions';
import { MetricsOptionsAugmentations } from './MetricsOptions-augmentations';

/** Registers a `IConfigureOptions<MetricsOptions>` step that runs `apply`. */
function configureMetrics(builder: IMetricsBuilder, apply: Func<[options: MetricsOptions], void>): IMetricsBuilder {
  const step: IConfigureOptions<MetricsOptions> = { configure(options: MetricsOptions): void {
    apply(options);
  } };
  builder.services = builder.services.addValue<IConfigureOptions<MetricsOptions>>(step);
  return builder;
}

export namespace MetricsBuilderAugmentations {
  /** Registers an already-built {@link IMetricsListener} instance. */
  export function addMetricsListener<Self extends IMetricsBuilder>(this: Self, listener: IMetricsListener): Self {
    this.services = this.services.addValue<IMetricsListener>(listener);
    return this;
  }

  /**
   * Registers an {@link IMetricsListener} by its implementation constructor (its
   * dependencies are injected). `implementerType` is the composed constructor type,
   * like every di.core `addClass` -- a dependency-free ctor names one with no
   * argument types.
   */
  export function addMetricsListenerType<Self extends IMetricsBuilder>(this: Self, ctor: Ctor, implementerType: ConstructorType): Self {
    this.services = this.services.add(typefor<IMetricsListener>(), ctor, implementerType);
    return this;
  }

  /** Removes all {@link IMetricsListener} registrations from the builder. */
  export function clearMetricsListeners<Self extends IMetricsBuilder>(this: Self): Self {
    this.services = this.services.removeAll<IMetricsListener>();
    return this;
  }

  /**
   * Enables instruments via a deferred rule -- registers a configure step that
   * appends an ENABLE rule to the bound {@link MetricsOptions}.
   */
  export function enableMetrics<Self extends IMetricsBuilder>(this: Self, meterName?: string, instrumentName?: string, listenerName?: string, scopes: MeterScope = METER_SCOPE_ALL): Self {
    return configureMetrics(this, (options) => {
      MetricsOptionsAugmentations.enableMetrics.call(options, meterName, instrumentName, listenerName, scopes);
    }) as Self;
  }

  /** Disables instruments via a deferred rule. */
  export function disableMetrics<Self extends IMetricsBuilder>(this: Self, meterName?: string, instrumentName?: string, listenerName?: string, scopes: MeterScope = METER_SCOPE_ALL): Self {
    return configureMetrics(this, (options) => {
      MetricsOptionsAugmentations.disableMetrics.call(options, meterName, instrumentName, listenerName, scopes);
    }) as Self;
  }
}

// The merge targets the package BARREL, not the relative declaring module: the
// downstream config-binding member merges the same interface from
// `@rhombus-std/diagnostics`, and a cross-package merge only reaches a published
// consumer if its specifier survives publish. The barrel is the one
// publish-resolvable specifier both sites can share.
declare module '@rhombus-std/diagnostics.core' {
  interface IMetricsBuilder extends Flatten<typeof MetricsBuilderAugmentations> {}
}

registerAugmentations<IMetricsBuilder>(MetricsBuilderAugmentations);
