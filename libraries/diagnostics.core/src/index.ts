// Ships the metrics/tracing configuration surface (options, rules, scope enums,
// builder interfaces) and their extension functions as real runtime -- but no
// metrics/tracing emission runtime sits behind them. What's provided is the
// pure-data rule/options model, the DI-registration wiring, and the
// most-specific-rule-wins resolvers (`getMostSpecificInstrumentRule`/
// `getMostSpecificTracingRule`) that decide whether a given instrument or
// activity source is enabled. See the package README for what's out of scope.

// Side-effect: installs enableMetrics/disableMetrics/enableTracing/disableTracing
// as instance methods onto MetricsOptions/TracingOptions. Package keeps
// `"sideEffects": true` so a bundler cannot drop this import.
import './options-install';

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
export { collectionToken, METRICS_CHANGE_TOKEN_SOURCE_TOKEN, METRICS_CONFIGURATION_TOKEN, METRICS_CONFIGURE_TOKEN,
  METRICS_LISTENER_CONFIGURATION_FACTORY_TOKEN, METRICS_LISTENER_TOKEN, METRICS_OPTIONS_TOKEN,
  TRACING_CHANGE_TOKEN_SOURCE_TOKEN, TRACING_CONFIGURATION_TOKEN, TRACING_CONFIGURE_TOKEN,
  TRACING_LISTENER_CONFIGURATION_FACTORY_TOKEN, TRACING_LISTENER_TOKEN, TRACING_OPTIONS_TOKEN } from './tokens';
