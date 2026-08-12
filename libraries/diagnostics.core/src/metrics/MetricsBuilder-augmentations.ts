// The builder-targeted listener/rule methods for IMetricsBuilder, an OPEN
// receiver whose concrete classes live downstream (@rhombus-std/diagnostics'
// MetricsBuilder and @rhombus-std/hosting's independent one, both decorated with
// the same token). The MetricsOptions-targeted mutators of the same names are
// the sibling ./MetricsOptions-augmentations set.

import type { Signatures } from '@rhombus-std/di.core';
import type { IConfigureOptions } from '@rhombus-std/options';
import { type AugmentationSet2, type Flatten, registerAugmentations } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Ctor, Func } from '@rhombus-toolkit/func';

import { METRICS_CONFIGURE_TYPE, METRICS_LISTENER_TYPE } from '../types';
import type { IMetricsBuilder } from './IMetricsBuilder';
import { METER_SCOPE_ALL, MeterScope } from './MeterScope';
import type { IMetricsListener } from './metrics-listener';
import { MetricsOptions } from './MetricsOptions';
import { MetricsOptionsAugmentations } from './MetricsOptions-augmentations';

interface IMetricsBuilderAugmentations {
  /** Registers an already-built {@link IMetricsListener} instance. */
  addMetricsListener(listener: IMetricsListener): this;
  /**
   * Registers an {@link IMetricsListener} by its implementation constructor (its
   * dependencies are injected). `signatures` carries the ctor's positional
   * dependency slots -- required, like every di.core `addClass`: a
   * dependency-free ctor states `[[]]` explicitly.
   */
  addMetricsListenerType(ctor: Ctor, signatures: Signatures): this;
  /** Removes all {@link IMetricsListener} registrations from the builder. */
  clearMetricsListeners(): this;
  /**
   * Enables instruments via a deferred rule -- registers a configure step that
   * appends an ENABLE rule to the bound {@link MetricsOptions}.
   */
  enableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
  /** Disables instruments via a deferred rule. */
  disableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
}

// The merge targets the package BARREL, not the relative declaring module: the
// downstream config-binding member merges the same interface from
// `@rhombus-std/diagnostics`, and a cross-package merge only reaches a published
// consumer if its specifier survives publish. The barrel is the one
// publish-resolvable specifier both sites can share.
declare module '@rhombus-std/diagnostics.core' {
  interface IMetricsBuilder extends IMetricsBuilderAugmentations {}
}

/** Registers a `IConfigureOptions<MetricsOptions>` step that runs `apply`. */
function configureMetrics(builder: IMetricsBuilder, apply: Func<[options: MetricsOptions], void>): IMetricsBuilder {
  const step: IConfigureOptions<MetricsOptions> = { configure(options: MetricsOptions): void {
    apply(options);
  } };
  builder.services = builder.services.addValue(METRICS_CONFIGURE_TYPE, step);
  return builder;
}

export const MetricsBuilderAugmentations: AugmentationSet2<IMetricsBuilder, Flatten<IMetricsBuilderAugmentations>> = {
  addMetricsListener(builder, listener) {
    builder.services = builder.services.addValue(METRICS_LISTENER_TYPE, listener);
    return builder;
  },
  addMetricsListenerType(builder, ctor, signatures) {
    builder.services = builder.services.addClass(METRICS_LISTENER_TYPE, ctor, signatures);
    return builder;
  },
  clearMetricsListeners(builder) {
    // The cast works around a TS structural-comparison depth limit: `services`'s
    // declared type (`Manifest`, Scopes defaulted) and
    // `removeAll`'s return (`Manifest<Scopes>`, Scopes bound to
    // `IServiceProvider<Scopes>`) are the same interface at two instantiations
    // that differ only in a covariant position -- genuinely assignable -- but the
    // overload surface `Manifest` carries pushes TS's relationship
    // check past its recursion budget, which it resolves as "not assignable"
    // rather than re-deriving the true relationship.
    builder.services = builder.services.removeAll(METRICS_LISTENER_TYPE) as typeof builder.services;
    return builder;
  },
  enableMetrics(builder, meterName, instrumentName, listenerName, scopes = METER_SCOPE_ALL) {
    return configureMetrics(builder, (options) => {
      MetricsOptionsAugmentations.enableMetrics(options, meterName, instrumentName, listenerName, scopes);
    });
  },
  disableMetrics(builder, meterName, instrumentName, listenerName, scopes = METER_SCOPE_ALL) {
    return configureMetrics(builder, (options) => {
      MetricsOptionsAugmentations.disableMetrics(options, meterName, instrumentName, listenerName, scopes);
    });
  },
};

registerAugmentations(typefor<IMetricsBuilder>(), MetricsBuilderAugmentations);
