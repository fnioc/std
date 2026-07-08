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
 * Appends an ENABLE {@link InstrumentRule} directly to a {@link MetricsOptions}.
 * Mirrors `MetricsOptions.EnableMetrics(...)`. `undefined` name arguments match
 * anything.
 */
function enableMetricsRule(
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
function disableMetricsRule(
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
function enableMetrics(
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
function disableMetrics(
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

/**
 * The `MetricsOptions`-targeted rule mutators (docs §28). Standalone-only: this
 * is an options-bag receiver, given NO prototype install (the boundary call
 * deferred at §22/§28); the member IS the standalone call surface.
 */
export const MetricsOptionsExtensions = {
  enableMetricsRule,
  disableMetricsRule,
} satisfies AugmentationSet<MetricsOptions>;
