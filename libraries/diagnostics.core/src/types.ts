// The DI types diagnostics wires its metrics/tracing slots through -- the ABI
// shared between the builder augmentations here (which register services
// against these types) and @rhombus-std/diagnostics's assembly (which resolves
// them). Kept in core so both sides agree.
//
// Every "collection" slot is registered with `services.add(<type>, x,
// ConstantType)` and read back with `resolver.resolve(collectionType(<type>))`
// -- the same wrapper convention @rhombus-std/options.augmentations uses to
// aggregate every registration of a slot.

import type { IConfigureOptions } from '@rhombus-std/options';
import { Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { IMetricsListener } from './metrics/metrics-listener';
import type { MetricsOptions } from './metrics/MetricsOptions';
import type { ActivityListenerBuilder } from './tracing/ActivityListenerBuilder';
import type { TracingOptions } from './tracing/TracingOptions';

const NAMESPACE = '@rhombus-std/diagnostics';

/** Collection slot: every registered {@link IMetricsListener}. */
export const METRICS_LISTENER_TYPE: Type = typefor<IMetricsListener>();
/** Collection slot: every `IConfigureOptions<MetricsOptions>` step. */
export const METRICS_CONFIGURE_TYPE: Type = typefor<IConfigureOptions<MetricsOptions>>();
/** Collection slot: every change-token source feeding the reactive `IOptions<MetricsOptions>`. */
export const METRICS_CHANGE_TOKEN_SOURCE_TYPE: Type = Type.imported('IOptionsChangeTokenSource', '@rhombus-std/options.augmentations', [typefor<MetricsOptions>()]);
/** The resolvable `IOptions<MetricsOptions>` the metrics assembly is registered at. */
export const METRICS_OPTIONS_TYPE: Type = Type.global(`${NAMESPACE}/metrics-options`);
/** Collection slot: every `MetricsConfig` marker `addMetricsConfig` registers. */
export const METRICS_CONFIGURATION_TYPE: Type = Type.imported('MetricsConfig', '@rhombus-std/diagnostics');
/** The resolvable `IMetricListenerConfigFactory` `addMetrics` registers. */
export const METRICS_LISTENER_CONFIGURATION_FACTORY_TYPE: Type = Type.imported(
  'IMetricListenerConfigFactory',
  '@rhombus-std/diagnostics',
);

/** Collection slot: every registered tracing {@link ActivityListenerBuilder}. */
export const TRACING_LISTENER_TYPE: Type = typefor<ActivityListenerBuilder>();
/** Collection slot: every `IConfigureOptions<TracingOptions>` step. */
export const TRACING_CONFIGURE_TYPE: Type = typefor<IConfigureOptions<TracingOptions>>();
/** Collection slot: every change-token source feeding the reactive `IOptions<TracingOptions>`. */
export const TRACING_CHANGE_TOKEN_SOURCE_TYPE: Type = Type.imported('IOptionsChangeTokenSource', '@rhombus-std/options.augmentations', [typefor<TracingOptions>()]);
/** The resolvable `IOptions<TracingOptions>` the tracing assembly is registered at. */
export const TRACING_OPTIONS_TYPE: Type = Type.global(`${NAMESPACE}/tracing-options`);
/** Collection slot: every `TracingConfig` marker `addTracingConfig` registers. */
export const TRACING_CONFIGURATION_TYPE: Type = Type.imported('TracingConfig', '@rhombus-std/diagnostics');
/** The resolvable `ActivityListenerConfigFactory` `addTracing` registers. */
export const TRACING_LISTENER_CONFIGURATION_FACTORY_TYPE: Type = Type.imported(
  'ActivityListenerConfigFactory',
  '@rhombus-std/diagnostics',
);

/**
 * The collection wrapper for `element` -- what the engine recognizes as a
 * collection request and aggregates every registration of the element into.
 */
export function collectionType(element: Type): Type {
  return Type.array(element);
}
