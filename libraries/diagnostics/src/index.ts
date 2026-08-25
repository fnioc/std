// Public entry point for @rhombus-std/diagnostics.
//
// Re-exports the family's own core (diagnostics.core's abstractions and
// rule/options model), the concrete MetricsBuilder/TracingBuilder,
// getMetricsManifest/getTracingManifest, and every augmentation set this
// package installs -- each re-export also runs that module's
// registerAugmentations side effect, so importing this barrel (even bare,
// `import "@rhombus-std/diagnostics";`) installs the config-binding sets
// onto the family's own builders and the config-bind IConfigureOptions
// steps. This package MUST keep `"sideEffects": true` so a bundler cannot
// tree-shake any of it away.
//
// There is no listener/subscription runtime behind any of this (no
// Meter/Instrument/Activity/ActivitySource) -- resolving the assembled
// options is as far as this package goes.

// Wholesale re-export of this family's own core (the IMetricsBuilder/
// ITracingBuilder abstractions, the rule/options data model, and the tokens),
// so a consumer depending on the runtime package resolves the abstractions from
// it too; the package's public surface stays a superset of its core's.
export * from '@rhombus-std/diagnostics.core';

// The concrete builders, exported here so a no-augmentation consumer can
// construct one directly.
export * from './metrics/MetricsBuilder';
export * from './tracing/TracingBuilder';

// `addMetrics`/`addTracing`: registers the resolvable `IOptions<MetricsOptions>`
// / `IOptions<TracingOptions>` assembly and the per-listener configuration
// factory onto di.core's `Manifest`, and runs the consumer's configure
// callback over a concrete builder.
export * from './manifests';

// The config-binding augmentation sets. Their receiver is the family's OWN
// builder interface; each self-registers against the builder token so the
// `@augment`'d MetricsBuilder/TracingBuilder gain the instance-method form,
// so both `MetricsBuilderConfigAugmentations.addMetricsConfig(builder, cfg)`
// and `builder.addMetricsConfig(cfg)` work. The method form is primary.
// Re-exporting the consts also runs each module's registerAugmentations side effect.
export * from './metrics/config/MetricsBuilder-Config-augmentations';
export * from './tracing/config/TracingBuilder-Config-augmentations';

// The config-bind IConfigureOptions steps, exposed so a plugin-less consumer
// can bind a configuration section without the addMetricsConfig wrapper.
export * from './metrics/config/MetricsConfigureOptions';
export * from './tracing/config/TracingConfigureOptions';

// The per-listener configuration factories. `addMetrics`/`addTracing` register
// the concrete factory at IMetricListenerConfigFactory / ActivityListenerConfigFactory;
// a consumer resolves it as IMetricListenerConfigFactory /
// ActivityListenerConfigFactory and asks for a listener's merged view.
// The concrete factories and the Metrics/TracingConfig markers are exposed here
// (like the IConfigureOptions steps above) so a plugin-less consumer can wire
// the same path by hand.
export type * from './metrics/config/IMetricListenerConfigFactory';
export * from './metrics/config/MetricListenerConfigFactory';
export * from './metrics/config/MetricsConfig';
export * from './tracing/config/ActivityListenerConfigFactory';
export * from './tracing/config/DefaultActivityListenerConfigFactory';
export * from './tracing/config/TracingConfig';
