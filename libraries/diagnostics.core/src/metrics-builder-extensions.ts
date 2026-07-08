// MetricsBuilderExtensions -- ported from MED.Metrics's
// `MetricsBuilderExtensions.{Listeners,Rules}` static extension classes.
//
// These target the family's OWN interface (IMetricsBuilder), so per this repo's
// "explicit form is primary" convention they are plain exported functions taking
// the builder as the first parameter -- no declaration-merging augmentation
// needed (that idiom is reserved for patching a class from ANOTHER package, e.g.
// di.core's ServiceManifestClass, which @rhombus-std/diagnostics does for
// addMetrics/addTracing). Each returns the builder for chaining.
//
// The reference splits EnableMetrics/DisableMetrics into a builder-targeted
// overload (registers a `Configure(MetricsOptions)` step) and a
// MetricsOptions-targeted overload (mutates the options directly). Both are
// ported: the builder-targeted `enableMetrics`/`disableMetrics`, and the
// options-targeted `enableMetricsRule`/`disableMetricsRule`.

import type { Ctor, DepSlot, Token } from "@rhombus-std/di.core";
import type { ConfigureOptions } from "@rhombus-std/options";

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
export function addMetricsListener(builder: IMetricsBuilder, listener: IMetricsListener): IMetricsBuilder {
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
export function addMetricsListenerType(
  builder: IMetricsBuilder,
  ctor: Ctor,
  signatures?: readonly (readonly DepSlot[])[],
): IMetricsBuilder {
  builder.services.add(METRICS_LISTENER_TOKEN, ctor, signatures);
  return builder;
}

/**
 * Appends an ENABLE {@link InstrumentRule} directly to a {@link MetricsOptions}.
 * Mirrors `MetricsOptions.EnableMetrics(...)`. `undefined` name arguments match
 * anything.
 */
export function enableMetricsRule(
  options: MetricsOptions,
  meterName?: string,
  instrumentName?: string,
  listenerName?: string,
  scopes: MeterScope = METER_SCOPE_ALL,
): MetricsOptions {
  options.rules.push(new InstrumentRule(meterName, instrumentName, listenerName, scopes, true));
  return options;
}

/**
 * Appends a DISABLE {@link InstrumentRule} directly to a {@link MetricsOptions}.
 * Mirrors `MetricsOptions.DisableMetrics(...)`.
 */
export function disableMetricsRule(
  options: MetricsOptions,
  meterName?: string,
  instrumentName?: string,
  listenerName?: string,
  scopes: MeterScope = METER_SCOPE_ALL,
): MetricsOptions {
  options.rules.push(new InstrumentRule(meterName, instrumentName, listenerName, scopes, false));
  return options;
}

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
export function enableMetrics(
  builder: IMetricsBuilder,
  meterName?: string,
  instrumentName?: string,
  listenerName?: string,
  scopes: MeterScope = METER_SCOPE_ALL,
): IMetricsBuilder {
  return configureMetrics(builder, (options) => {
    enableMetricsRule(options, meterName, instrumentName, listenerName, scopes);
  });
}

/**
 * Disables instruments via a deferred rule. Mirrors
 * `MetricsBuilderExtensions.DisableMetrics(IMetricsBuilder, ...)`.
 */
export function disableMetrics(
  builder: IMetricsBuilder,
  meterName?: string,
  instrumentName?: string,
  listenerName?: string,
  scopes: MeterScope = METER_SCOPE_ALL,
): IMetricsBuilder {
  return configureMetrics(builder, (options) => {
    disableMetricsRule(options, meterName, instrumentName, listenerName, scopes);
  });
}
