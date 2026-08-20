// Ships the metrics/tracing configuration surface (options, rules, scope enums,
// builder interfaces) and their augmentation functions as real runtime -- but no
// metrics/tracing emission runtime sits behind them. What's provided is the
// pure-data rule/options model, the DI-registration wiring, and the
// most-specific-rule-wins resolvers (`getMostSpecificInstrumentRule`/
// `getMostSpecificTracingRule`) that decide whether a given instrument or
// activity source is enabled. See the package README for what's out of scope.

// Metrics.
export type * from './metrics/IMetricsBuilder';
export * from './metrics/instrument-rule-matching';
export * from './metrics/InstrumentRule';
export * from './metrics/MeterScope';
export type * from './metrics/metrics-listener';
export * from './metrics/MetricsBuilder-augmentations';
export * from './metrics/MetricsOptions';
export * from './metrics/MetricsOptions-augmentations';

// Tracing.
export * from './tracing/ActivityListenerBuilder';
export * from './tracing/ActivitySourceScopes';
export type * from './tracing/ITracingBuilder';
export * from './tracing/tracing-rule-matching';
export * from './tracing/TracingBuilder-augmentations';
export * from './tracing/TracingOptions';
export * from './tracing/TracingOptions-augmentations';
export * from './tracing/TracingRule';

// The DI-slot type ABI shared with @rhombus-std/diagnostics, plus the types
// the metrics/tracing builder augmentations register against.
export * from './types';
