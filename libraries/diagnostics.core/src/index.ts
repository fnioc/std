// Public entry point for @rhombus-std/diagnostics.core -- the ME.Diagnostics.Abstractions
// analog. Ships the metrics/tracing CONFIGURATION surface (options, rules, scope
// enums, builder interfaces) and the builder extension FUNCTIONS as real runtime.
// There is no metrics/tracing runtime behind these (no Meter/Instrument/Activity/
// ActivitySource analog in this repo) -- what is ported is the pure-data rule /
// options model, the DI-registration wiring, and the most-specific-rule-wins
// resolvers (`getMostSpecificInstrumentRule`/`getMostSpecificTracingRule`, the
// selection algorithms the reference listener runtimes evaluate their rules
// with, promoted here to the consumable selection primitive), which is
// self-consistent and useful on its own. See the package README/tbd for what is
// intentionally skipped.

// Side-effect: installs the MetricsOptions/TracingOptions value-object augmentations
// (enableMetrics/disableMetrics/enableTracing/disableTracing) as instance methods onto
// the concrete option classes -- the reverse-direction half of their dual-export
// (docs §28). Package keeps `"sideEffects": true` so a bundler cannot drop it.
import "./options-augmentations";

// Metrics.
export type { IMetricsBuilder } from "./Metrics/IMetricsBuilder";
export {
  getMostSpecificInstrumentRule,
  instrumentRuleMatches,
  isMoreSpecificInstrumentRule,
} from "./Metrics/instrument-rule-matching";
export type { InstrumentRuleQuery } from "./Metrics/instrument-rule-matching";
export { InstrumentRule } from "./Metrics/InstrumentRule";
export { METER_SCOPE_ALL, MeterScope } from "./Metrics/meter-scope";
export { MetricsBuilderExtensions, MetricsOptionsExtensions } from "./Metrics/metrics-builder-augmentations";
export type { IMetricsListener, IObservableInstrumentsSource } from "./Metrics/metrics-listener";
export { MetricsOptions } from "./Metrics/MetricsOptions";

// Tracing.
export { ACTIVITY_SOURCE_SCOPES_ALL, ActivitySourceScopes } from "./Tracing/activity-source-scopes";
export { ActivityListenerBuilder } from "./Tracing/ActivityListenerBuilder";
export type { ITracingBuilder } from "./Tracing/ITracingBuilder";
export { TracingBuilderExtensions, TracingOptionsExtensions } from "./Tracing/tracing-builder-augmentations";
export {
  getMostSpecificTracingRule,
  isMoreSpecificTracingRule,
  tracingRuleMatches,
} from "./Tracing/tracing-rule-matching";
export type { TracingRuleQuery } from "./Tracing/tracing-rule-matching";
export { TracingOptions } from "./Tracing/TracingOptions";
export { TracingRule } from "./Tracing/TracingRule";

// The DI-slot token ABI shared with @rhombus-std/diagnostics, plus the
// augmentation-registry tokens for the OPEN metrics/tracing builder receivers (§38).
export {
  collectionToken,
  METRICS_CHANGE_TOKEN_SOURCE_TOKEN,
  METRICS_CONFIGURATION_TOKEN,
  METRICS_CONFIGURE_TOKEN,
  METRICS_LISTENER_CONFIGURATION_FACTORY_TOKEN,
  METRICS_LISTENER_TOKEN,
  METRICS_OPTIONS_TOKEN,
  TRACING_CHANGE_TOKEN_SOURCE_TOKEN,
  TRACING_CONFIGURATION_TOKEN,
  TRACING_CONFIGURE_TOKEN,
  TRACING_LISTENER_CONFIGURATION_FACTORY_TOKEN,
  TRACING_LISTENER_TOKEN,
  TRACING_OPTIONS_TOKEN,
} from "./tokens";
