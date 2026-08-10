// MetricsBuilderExtensions / MetricsOptionsExtensions -- the builder-targeted
// listener/rule methods (installed onto IMetricsBuilder, an OPEN receiver whose
// concrete classes live downstream) and the MetricsOptions-targeted rule
// mutators (a CLOSED set installed in-package via ./options-augmentations).
// Both groups are dual-export augmentations: a named object literal installed
// onto the receiver's prototype AND reachable as `Set.member(receiver, …)`.
// The two groups share the same member names (enableMetrics/disableMetrics),
// distinguished only by which receiver they're installed on.

import type { Ctor, DepSignatures, Token } from '@rhombus-std/di.core';
import type { IConfigureOptions } from '@rhombus-std/options';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

import { tokenfor } from '@rhombus-std/primitives.extras';
import { METRICS_CONFIGURE_TOKEN, METRICS_LISTENER_TOKEN } from '../tokens';
import type { IMetricsBuilder } from './IMetricsBuilder';
import { InstrumentRule } from './InstrumentRule';
import { METER_SCOPE_ALL, MeterScope } from './MeterScope';
import type { IMetricsListener } from './metrics-listener';
import { MetricsOptions } from './MetricsOptions';

/**
 * The `MetricsOptions`-targeted rule mutators, installed onto
 * `MetricsOptions.prototype` in ./options-augmentations. `undefined` name
 * arguments match anything.
 */
export const MetricsOptionsExtensions = {
  /** Appends an ENABLE {@link InstrumentRule} directly to a {@link MetricsOptions}. */
  enableMetrics(options: MetricsOptions, meterName?: string, instrumentName?: string, listenerName?: string,
    scopes: MeterScope = METER_SCOPE_ALL): MetricsOptions {
    options.rules.push(new InstrumentRule(meterName, instrumentName, listenerName, scopes, true));
    return options;
  },
  /** Appends a DISABLE {@link InstrumentRule} directly to a {@link MetricsOptions}. */
  disableMetrics(options: MetricsOptions, meterName?: string, instrumentName?: string, listenerName?: string,
    scopes: MeterScope = METER_SCOPE_ALL): MetricsOptions {
    options.rules.push(new InstrumentRule(meterName, instrumentName, listenerName, scopes, false));
    return options;
  },
} satisfies AugmentationSet<MetricsOptions>;

/** Registers a `IConfigureOptions<MetricsOptions>` step at `token` that runs `apply`. */
function configureMetrics(builder: IMetricsBuilder, apply: Func<[options: MetricsOptions], void>): IMetricsBuilder {
  const step: IConfigureOptions<MetricsOptions> = { configure(options: MetricsOptions): void {
    apply(options);
  } };
  const token: Token = METRICS_CONFIGURE_TOKEN;
  builder.services = builder.services.addValue(token, step);
  return builder;
}

/**
 * The builder-targeted listener/rule methods for {@link IMetricsBuilder},
 * installed onto the concrete builder downstream in `@rhombus-std/diagnostics`.
 */
export const MetricsBuilderExtensions = {
  /** Registers an already-built {@link IMetricsListener} instance. */
  addMetricsListener(builder: IMetricsBuilder, listener: IMetricsListener): IMetricsBuilder {
    builder.services = builder.services.addValue(METRICS_LISTENER_TOKEN, listener);
    return builder;
  },
  /**
   * Registers an {@link IMetricsListener} by its implementation constructor (its
   * dependencies are injected). `signatures` carries the ctor's positional
   * dependency slots -- required, like every di.core `addClass`: a
   * dependency-free ctor states `[[]]` explicitly.
   */
  addMetricsListenerType(builder: IMetricsBuilder, ctor: Ctor, signatures: DepSignatures): IMetricsBuilder {
    builder.services = builder.services.addClass(METRICS_LISTENER_TOKEN, ctor, signatures);
    return builder;
  },
  /**
   * Removes all {@link IMetricsListener} registrations from the builder, via
   * di.core's `removeAll` descriptor verb, installed as a manifest method
   * through the augmentation registry.
   */
  clearMetricsListeners(builder: IMetricsBuilder): IMetricsBuilder {
    // The cast works around a TS structural-comparison depth limit: `services`'s
    // declared type (`IServiceManifestBase`, Provider defaulted to `unknown`) and
    // `removeAll`'s return (`IServiceManifest<Scopes>`, Provider bound to
    // `IServiceProvider<Scopes>`) are the same interface at two instantiations
    // that differ only in a covariant position -- genuinely assignable -- but the
    // huge overload surface `IServiceManifestBase` carries (di.core's
    // ServiceManifestDescriptorAugmentations merge) pushes TS's relationship check
    // past its recursion budget, which it resolves as "not assignable" rather
    // than re-deriving the true (assignable) relationship.
    builder.services = builder.services.removeAll(METRICS_LISTENER_TOKEN) as typeof builder.services;
    return builder;
  },
  /**
   * Enables instruments via a deferred rule -- registers a configure step that
   * appends an ENABLE {@link InstrumentRule} to the bound {@link MetricsOptions}.
   */
  enableMetrics(builder: IMetricsBuilder, meterName?: string, instrumentName?: string, listenerName?: string,
    scopes: MeterScope = METER_SCOPE_ALL): IMetricsBuilder {
    return configureMetrics(builder, (options) => {
      MetricsOptionsExtensions.enableMetrics(options, meterName, instrumentName, listenerName, scopes);
    });
  },
  /** Disables instruments via a deferred rule. */
  disableMetrics(builder: IMetricsBuilder, meterName?: string, instrumentName?: string, listenerName?: string,
    scopes: MeterScope = METER_SCOPE_ALL): IMetricsBuilder {
    return configureMetrics(builder, (options) => {
      MetricsOptionsExtensions.disableMetrics(options, meterName, instrumentName, listenerName, scopes);
    });
  },
} satisfies AugmentationSet<IMetricsBuilder>;

// Self-registration for the OPEN `IMetricsBuilder` receiver. The interface-side
// declaration merge lives here beside the const; the class-side merges for each
// concrete builder stay downstream next to the class
// (@rhombus-std/diagnostics' builder-augmentations, @rhombus-std/hosting's
// metrics-builder). The concrete `MetricsBuilder` classes are decorated
// `@augment(the IMetricsBuilder token)`, so this registration reaches their
// prototypes -- including hosting's independent `MetricsBuilder`, which shares
// the same token.
//
// The merge targets the package BARREL (`@rhombus-std/diagnostics.core`), not the
// relative declaring module: the downstream config-binding member merges the
// same interface from `@rhombus-std/diagnostics`, and a cross-package merge only
// reaches a published consumer if its specifier survives publish. The barrel is
// the one publish-resolvable specifier both the in-package and downstream sites
// can share, so both flip here.
declare module '@rhombus-std/diagnostics.core' {
  interface IMetricsBuilder {
    addMetricsListener(listener: IMetricsListener): this;
    addMetricsListenerType(ctor: Ctor, signatures: DepSignatures): this;
    clearMetricsListeners(): this;
    enableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
    disableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
  }
}

registerAugmentations(tokenfor<IMetricsBuilder>(), MetricsBuilderExtensions);
