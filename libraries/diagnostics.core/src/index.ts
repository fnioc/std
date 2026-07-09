// Public entry point for @rhombus-std/diagnostics.core -- the ME.Diagnostics.Abstractions
// analog. Ships the metrics/tracing CONFIGURATION surface (options, rules, scope
// enums, builder interfaces) and the builder extension FUNCTIONS as real runtime.
// There is no metrics/tracing runtime behind these (no Meter/Instrument/Activity/
// ActivitySource analog in this repo) -- what is ported is the pure-data rule /
// options model plus the DI-registration wiring, which is self-consistent and
// useful on its own. See the package README/tbd for what is intentionally skipped.

// Side-effect: installs the MetricsOptions/TracingOptions value-object augmentations
// (enableMetrics/disableMetrics/enableTracing/disableTracing) as instance methods onto
// the concrete option classes -- the reverse-direction half of their dual-export
// (docs §28). Package keeps `"sideEffects": true` so a bundler cannot drop it.
import "./options-augmentations";

// Metrics.
export { InstrumentRule } from "./instrument-rule";
export { METER_SCOPE_ALL, MeterScope } from "./meter-scope";
export type { IMetricsBuilder } from "./metrics-builder";
export { MetricsBuilderExtensions, MetricsOptionsExtensions } from "./metrics-builder-augmentations";
export type { IMetricsListener, IObservableInstrumentsSource } from "./metrics-listener";
export { MetricsOptions } from "./metrics-options";

// Tracing.
export { ActivityListenerBuilder } from "./activity-listener-builder";
export { ACTIVITY_SOURCE_SCOPES_ALL, ActivitySourceScopes } from "./activity-source-scopes";
export type { ITracingBuilder } from "./tracing-builder";
export { TracingBuilderExtensions, TracingOptionsExtensions } from "./tracing-builder-augmentations";
export { TracingOptions } from "./tracing-options";
export { TracingRule } from "./tracing-rule";

// The DI-slot token ABI shared with @rhombus-std/diagnostics, plus the
// augmentation-registry tokens for the OPEN metrics/tracing builder receivers (§38).
export {
  collectionToken,
  METRICS_BUILDER_AUGMENTATION_TOKEN,
  METRICS_CHANGE_TOKEN_SOURCE_TOKEN,
  METRICS_CONFIGURE_TOKEN,
  METRICS_LISTENER_TOKEN,
  METRICS_OPTIONS_TOKEN,
  TRACING_BUILDER_AUGMENTATION_TOKEN,
  TRACING_CHANGE_TOKEN_SOURCE_TOKEN,
  TRACING_CONFIGURE_TOKEN,
  TRACING_LISTENER_TOKEN,
  TRACING_OPTIONS_TOKEN,
} from "./tokens";
