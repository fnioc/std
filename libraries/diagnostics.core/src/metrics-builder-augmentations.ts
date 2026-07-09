// MetricsBuilderExtensions / MetricsOptionsExtensions -- ported from MED.Metrics's
// `MetricsBuilderExtensions.{Listeners,Rules}` static extension classes.
//
// The builder-targeted members target the family's OWN interface (IMetricsBuilder);
// the options-targeted members target the concrete value object MetricsOptions.
// Both groups are dual-export augmentations (docs §28): a named object literal
// installed onto the receiver's prototype AND reachable as `Set.member(receiver, …)`.
// IMetricsBuilder is an OPEN receiver whose concrete classes live downstream
// (@rhombus-std/diagnostics' MetricsBuilder AND @rhombus-std/hosting's), so its
// literal self-registers here against METRICS_BUILDER_AUGMENTATION_TOKEN (docs §38);
// each concrete builder is decorated `@augment(token)` and pulls the bag onto its
// prototype. The MetricsOptions literal is a CLOSED set installed in-package (the
// concrete class lives here) via direct applyAugmentations in ./options-augmentations.
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
import { registerAugmentations } from "@rhombus-std/primitives";

import { InstrumentRule } from "./instrument-rule";
import { METER_SCOPE_ALL, MeterScope } from "./meter-scope";
import type { IMetricsBuilder } from "./metrics-builder";
import type { IMetricsListener } from "./metrics-listener";
import { MetricsOptions } from "./metrics-options";
import { METRICS_BUILDER_AUGMENTATION_TOKEN, METRICS_CONFIGURE_TOKEN, METRICS_LISTENER_TOKEN } from "./tokens";

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

// Self-registration for the OPEN `IMetricsBuilder` receiver (docs §38). The
// interface-side declaration merge lives here beside the const (rule §38.6:
// OPEN-set consts register their own runtime in `.core`, so the interface merge
// moves in beside them); the class-side merges for each concrete builder stay
// downstream next to the class (@rhombus-std/diagnostics' builder-augmentations,
// @rhombus-std/hosting's metrics-builder). The concrete `MetricsBuilder` classes
// are decorated `@augment(METRICS_BUILDER_AUGMENTATION_TOKEN)`, so this registration
// reaches their prototypes -- including hosting's independent `MetricsBuilder`,
// which shares the same token.
declare module "./metrics-builder" {
  interface IMetricsBuilder {
    addMetricsListener(listener: IMetricsListener): this;
    addMetricsListenerType(ctor: Ctor, signatures?: readonly (readonly DepSlot[])[]): this;
    enableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
    disableMetrics(meterName?: string, instrumentName?: string, listenerName?: string, scopes?: MeterScope): this;
  }
}

registerAugmentations(METRICS_BUILDER_AUGMENTATION_TOKEN, MetricsBuilderExtensions);
