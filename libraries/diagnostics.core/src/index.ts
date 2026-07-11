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
export type { IMetricsBuilder } from "./metrics/IMetricsBuilder";
export {
  getMostSpecificInstrumentRule,
  instrumentRuleMatches,
  isMoreSpecificInstrumentRule,
} from "./metrics/instrument-rule-matching";
export type { InstrumentRuleQuery } from "./metrics/instrument-rule-matching";
export { InstrumentRule } from "./metrics/InstrumentRule";
export { METER_SCOPE_ALL, MeterScope } from "./metrics/meter-scope";
export { MetricsBuilderExtensions, MetricsOptionsExtensions } from "./metrics/metrics-builder-augmentations";
export type { IMetricsListener, IObservableInstrumentsSource } from "./metrics/metrics-listener";
export { MetricsOptions } from "./metrics/MetricsOptions";

// Tracing.
export { ACTIVITY_SOURCE_SCOPES_ALL, ActivitySourceScopes } from "./tracing/activity-source-scopes";
export { ActivityListenerBuilder } from "./tracing/ActivityListenerBuilder";
export type { ITracingBuilder } from "./tracing/ITracingBuilder";
export { TracingBuilderExtensions, TracingOptionsExtensions } from "./tracing/tracing-builder-augmentations";
export {
  getMostSpecificTracingRule,
  isMoreSpecificTracingRule,
  tracingRuleMatches,
} from "./tracing/tracing-rule-matching";
export type { TracingRuleQuery } from "./tracing/tracing-rule-matching";
export { TracingOptions } from "./tracing/TracingOptions";
export { TracingRule } from "./tracing/TracingRule";

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
