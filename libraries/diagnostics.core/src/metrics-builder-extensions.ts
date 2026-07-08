// MetricsBuilderExtensions / MetricsOptionsExtensions -- ported from MED.Metrics's
// `MetricsBuilderExtensions.{Listeners,Rules}` static extension classes.
//
// The builder-targeted members target the family's OWN interface (IMetricsBuilder);
// the options-targeted members target the concrete value object MetricsOptions.
// Both groups are dual-export augmentations (docs §28): a named object literal
// installed onto the receiver's prototype AND reachable as `Set.member(receiver, …)`.
// The IMetricsBuilder literal is installed downstream in @rhombus-std/diagnostics
// (the concrete MetricsBuilder lives there); the MetricsOptions literal is installed
// in-package (the concrete class lives here) via ./options-augmentations.
//
// The reference splits EnableMetrics/DisableMetrics into a builder-targeted overload
// (registers a `Configure(MetricsOptions)` step) and a MetricsOptions-targeted
// overload (mutates the options directly). Both are ported and, per ME, share the
// SAME name distinguished only by receiver: `enableMetrics`/`disableMetrics` on the
// builder (in `MetricsBuilderExtensions`) and on the options (in
// `MetricsOptionsExtensions`). #115's object-literal-per-ME-class shape lets the two
// overloads live as members of two different literals, so the names no longer collide
// -- the former `*Rule` suffix, added only to avoid a top-level free-function clash,
// is dropped (#105).

import type { Ctor, DepSlot, Token } from "@rhombus-std/di.core";
import type { ConfigureOptions } from "@rhombus-std/options";
import type { AugmentationSet } from "@rhombus-std/primitives";

import { InstrumentRule } from "./instrument-rule";
import { METER_SCOPE_ALL, MeterScope } from "./meter-scope";
import type { IMetricsBuilder } from "./metrics-builder";
import type { IMetricsListener } from "./metrics-listener";
import { MetricsOptions } from "./metrics-options";
import { METRICS_CONFIGURE_TOKEN, METRICS_LISTENER_TOKEN } from "./tokens";

/**
 * Registers an already-built {@link IMetricsListener} instance. Mirrors
 * `MetricsBuilderExtensions.AddListener(IMetricsBuilder, IMetricsListener)`.
 */
function addMetricsListener(builder: IMetricsBuilder, listener: IMetricsListener): IMetricsBuilder {
  builder.services.addValue(METRICS_LISTENER_TOKEN, listener);
  return builder;
}

/**
 * Registers an {@link IMetricsListener} by its implementation constructor (its
 * dependencies are injected). Mirrors the generic
 * `MetricsBuilderExtensions.AddListener<T>()`. `signatures` carries the ctor's
 * positional dependency slots (as a plugin-less author supplies them, or as the
 * di.transformer would emit).
 */
function addMetricsListenerType(
  builder: IMetricsBuilder,
  ctor: Ctor,
  signatures?: readonly (readonly DepSlot[])[],
): IMetricsBuilder {
  builder.services.add(METRICS_LISTENER_TOKEN, ctor, signatures);
  return builder;
}

/**
 * The `MetricsOptions`-targeted rule mutators (docs §28) -- the value-object
 * overloads of `MetricsBuilderExtensions.{Enable,Disable}Metrics`, which ME names
 * identically to their builder counterparts, distinguished only by `this` receiver.
 * Installed onto `MetricsOptions.prototype` in ./options-augmentations. `undefined`
 * name arguments match anything.
 */
export const MetricsOptionsExtensions = {
  /**
   * Appends an ENABLE {@link InstrumentRule} directly to a {@link MetricsOptions}.
   * Mirrors `MetricsOptions.EnableMetrics(...)`.
   */
  enableMetrics(
    options: MetricsOptions,
    meterName?: string,
    instrumentName?: string,
    listenerName?: string,
    scopes: MeterScope = METER_SCOPE_ALL,
  ): MetricsOptions {
    options.rules.push(new InstrumentRule(meterName, instrumentName, listenerName, scopes, true));
    return options;
  },
  /**
   * Appends a DISABLE {@link InstrumentRule} directly to a {@link MetricsOptions}.
   * Mirrors `MetricsOptions.DisableMetrics(...)`.
   */
  disableMetrics(
    options: MetricsOptions,
    meterName?: string,
    instrumentName?: string,
    listenerName?: string,
    scopes: MeterScope = METER_SCOPE_ALL,
  ): MetricsOptions {
    options.rules.push(new InstrumentRule(meterName, instrumentName, listenerName, scopes, false));
    return options;
  },
} satisfies AugmentationSet<MetricsOptions>;

/** Registers a `ConfigureOptions<MetricsOptions>` step at `token` that runs `apply`. */
function configureMetrics(builder: IMetricsBuilder, apply: (options: MetricsOptions) => void): IMetricsBuilder {
  const step: ConfigureOptions<MetricsOptions> = {
    configure(options: MetricsOptions): void {
      apply(options);
    },
  };
  const token: Token = METRICS_CONFIGURE_TOKEN;
  builder.services.addValue(token, step);
  return builder;
}

/**
 * Enables instruments via a deferred rule -- registers a configure step that
 * appends an ENABLE {@link InstrumentRule} to the bound {@link MetricsOptions}.
 * Mirrors `MetricsBuilderExtensions.EnableMetrics(IMetricsBuilder, ...)`.
 */
function enableMetrics(
  builder: IMetricsBuilder,
  meterName?: string,
  instrumentName?: string,
  listenerName?: string,
  scopes: MeterScope = METER_SCOPE_ALL,
): IMetricsBuilder {
  return configureMetrics(builder, (options) => {
    MetricsOptionsExtensions.enableMetrics(options, meterName, instrumentName, listenerName, scopes);
  });
}

/**
 * Disables instruments via a deferred rule. Mirrors
 * `MetricsBuilderExtensions.DisableMetrics(IMetricsBuilder, ...)`.
 */
function disableMetrics(
  builder: IMetricsBuilder,
  meterName?: string,
  instrumentName?: string,
  listenerName?: string,
  scopes: MeterScope = METER_SCOPE_ALL,
): IMetricsBuilder {
  return configureMetrics(builder, (options) => {
    MetricsOptionsExtensions.disableMetrics(options, meterName, instrumentName, listenerName, scopes);
  });
}

/**
 * The `MetricsBuilderExtensions` augmentation set for {@link IMetricsBuilder}
 * (docs §28) -- the builder-targeted listener/rule methods. Installed onto the
 * concrete builder downstream in `@rhombus-std/diagnostics`.
 */
export const MetricsBuilderExtensions = {
  addMetricsListener,
  addMetricsListenerType,
  enableMetrics,
  disableMetrics,
} satisfies AugmentationSet<IMetricsBuilder>;
