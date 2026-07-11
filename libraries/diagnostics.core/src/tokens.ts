// The DI tokens diagnostics wires its metrics/tracing slots through -- the ABI
// shared between the builder extension functions here (which register services
// against these tokens) and @rhombus-std/diagnostics's assembly (which resolves
// them). Kept in core so both sides agree on the exact strings.
//
// Every "collection" slot is registered with `services.addValue(<token>, x)` and
// read back with `resolver.resolve(collectionToken(<token>))` -- the same
// `Array<...>`-wrapper collection-resolution convention @rhombus-std/options.augmentations
// uses to aggregate every registration of a slot.

import type { Token } from '@rhombus-std/di.core';

const NAMESPACE = '@rhombus-std/diagnostics';

/** Collection slot: every registered {@link IMetricsListener}. */
export const METRICS_LISTENER_TOKEN: Token = `${NAMESPACE}/metrics-listener`;
/** Collection slot: every `ConfigureOptions<MetricsOptions>` step. */
export const METRICS_CONFIGURE_TOKEN: Token = `${NAMESPACE}/metrics-configure`;
/** Collection slot: every change-token source feeding the reactive `Options<MetricsOptions>`. */
export const METRICS_CHANGE_TOKEN_SOURCE_TOKEN: Token = `${NAMESPACE}/metrics-change-token-source`;
/** The resolvable `Options<MetricsOptions>` the metrics assembly is registered at. */
export const METRICS_OPTIONS_TOKEN: Token = `${NAMESPACE}/metrics-options`;
/** Collection slot: every `MetricsConfiguration` marker `addMetricsConfiguration` registers. */
export const METRICS_CONFIGURATION_TOKEN: Token = `${NAMESPACE}/metrics-configuration`;
/** The resolvable `IMetricListenerConfigurationFactory` `addMetrics` registers. */
export const METRICS_LISTENER_CONFIGURATION_FACTORY_TOKEN: Token =
  `${NAMESPACE}/metrics-listener-configuration-factory`;

/** Collection slot: every registered tracing `ActivityListenerBuilder`. */
export const TRACING_LISTENER_TOKEN: Token = `${NAMESPACE}/tracing-listener`;
/** Collection slot: every `ConfigureOptions<TracingOptions>` step. */
export const TRACING_CONFIGURE_TOKEN: Token = `${NAMESPACE}/tracing-configure`;
/** Collection slot: every change-token source feeding the reactive `Options<TracingOptions>`. */
export const TRACING_CHANGE_TOKEN_SOURCE_TOKEN: Token = `${NAMESPACE}/tracing-change-token-source`;
/** The resolvable `Options<TracingOptions>` the tracing assembly is registered at. */
export const TRACING_OPTIONS_TOKEN: Token = `${NAMESPACE}/tracing-options`;
/** Collection slot: every `TracingConfiguration` marker `addTracingConfiguration` registers. */
export const TRACING_CONFIGURATION_TOKEN: Token = `${NAMESPACE}/tracing-configuration`;
/** The resolvable `ActivityListenerConfigurationFactory` `addTracing` registers. */
export const TRACING_LISTENER_CONFIGURATION_FACTORY_TOKEN: Token =
  `${NAMESPACE}/tracing-listener-configuration-factory`;

/**
 * The collection-wrapper token for `elementToken` -- the string the engine
 * recognizes as a collection request and aggregates every registration of the
 * element into.
 */
export function collectionToken(elementToken: Token): Token {
  return `Array<${elementToken}>`;
}
