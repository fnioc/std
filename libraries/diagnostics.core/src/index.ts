// Ships the metrics/tracing configuration surface (options, rules, scope enums,
// builder interfaces) and their augmentation functions as real runtime -- but no
// metrics/tracing emission runtime sits behind them. What's provided is the
// pure-data rule/options model, the DI-registration wiring, and the
// most-specific-rule-wins resolvers (`getMostSpecificInstrumentRule`/
// `getMostSpecificTracingRule`) that decide whether a given instrument or
// activity source is enabled. See the package README for what's out of scope.

// Metrics.
export type { IMetricsBuilder } from './metrics/IMetricsBuilder';
export { getMostSpecificInstrumentRule, instrumentRuleMatches,
  isMoreSpecificInstrumentRule } from './metrics/instrument-rule-matching';
export type { InstrumentRuleQuery } from './metrics/instrument-rule-matching';
export { InstrumentRule } from './metrics/InstrumentRule';
export { METER_SCOPE_ALL, MeterScope } from './metrics/MeterScope';
export type { IMetricsListener, IObservableInstrumentsSource } from './metrics/metrics-listener';
export { MetricsBuilderAugmentations } from './metrics/MetricsBuilder-augmentations';
export { MetricsOptions } from './metrics/MetricsOptions';
export { MetricsOptionsAugmentations } from './metrics/MetricsOptions-augmentations';

// Tracing.
export { ActivityListenerBuilder } from './tracing/ActivityListenerBuilder';
export { ACTIVITY_SOURCE_SCOPES_ALL, ActivitySourceScopes } from './tracing/ActivitySourceScopes';
export type { ITracingBuilder } from './tracing/ITracingBuilder';
export { getMostSpecificTracingRule, isMoreSpecificTracingRule,
  tracingRuleMatches } from './tracing/tracing-rule-matching';
export type { TracingRuleQuery } from './tracing/tracing-rule-matching';
export { TracingBuilderAugmentations } from './tracing/TracingBuilder-augmentations';
export { TracingOptions } from './tracing/TracingOptions';
export { TracingOptionsAugmentations } from './tracing/TracingOptions-augmentations';
export { TracingRule } from './tracing/TracingRule';

// The DI-slot token ABI shared with @rhombus-std/diagnostics, plus the tokens
// the metrics/tracing builder augmentations register against.
export { collectionType, METRICS_CHANGE_TOKEN_SOURCE_TYPE, METRICS_CONFIGURATION_TYPE, METRICS_CONFIGURE_TYPE,
  METRICS_LISTENER_CONFIGURATION_FACTORY_TYPE, METRICS_LISTENER_TYPE, METRICS_OPTIONS_TYPE,
  TRACING_CHANGE_TOKEN_SOURCE_TYPE, TRACING_CONFIGURATION_TYPE, TRACING_CONFIGURE_TYPE,
  TRACING_LISTENER_CONFIGURATION_FACTORY_TYPE, TRACING_LISTENER_TYPE, TRACING_OPTIONS_TYPE } from './types';
