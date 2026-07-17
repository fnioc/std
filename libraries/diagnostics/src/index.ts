// Public entry point for @rhombus-std/diagnostics -- the ME.Diagnostics (impl)
// analog.
//
// Ships the concrete MetricsBuilder/TracingBuilder, the config-binding
// augmentation sets (Metrics/TracingBuilderConfigurationExtensions), the config-bind
// ConfigureOptions steps, and -- as a SIDE EFFECT of importing this module --
// installs the `addMetrics`/`addTracing` fluent authoring methods onto di.core's
// registration builder AND the metrics/tracing builder extensions as instance
// methods on the family's own builders (both via the dual-export convention,
// docs §28/§38: every augmentation available as a standalone function AND a method).
//
// `addMetrics`/`addTracing` target di.core's ServiceManifestClass -- a class this
// package does NOT own -- so they are OPEN-set augmentations (docs §38): TS
// declaration merging + a `registerAugmentations` against the ServiceManifest
// token, which the class's `@augment` decoration installs, exactly how
// @rhombus-std/options.augmentations adds `addOptions`/`configure` and
// @rhombus-std/config.json adds `addJsonFile`. A consumer who only wants the
// sugar takes a bare side-effect import: `import "@rhombus-std/diagnostics";`.
// This package MUST keep `"sideEffects": true` so a bundler cannot tree-shake the
// augmentation away.
//
// The reference AddMetrics/AddTracing register a listener/subscription RUNTIME
// (DefaultMeterFactory, MetricsSubscriptionManager, DefaultActivitySourceFactory,
// the NoOpOptions/SubscriptionActivator startup hooks) -- none of which has an
// analog here (no Meter/Instrument/Activity/ActivitySource runtime). What is
// ported is registering the resolvable `Options<MetricsOptions>` /
// `Options<TracingOptions>` assembly (so a consumer can resolve the assembled,
// config-reactive rule set), the per-listener configuration factory
// (IMetricListenerConfigurationFactory / ActivityListenerConfigurationFactory,
// which merges the `{listenerName}` sections of every configuration bound via
// addMetricsConfiguration/addTracingConfiguration), and running the consumer's
// configure callback over a concrete builder. See the package tbd notes for what
// the missing runtime would add.

// `Func`, `IMetricsBuilder`/`ITracingBuilder` are named imports (not member
// references inside the augmentation block) because unqualified names in a
// `declare module` body resolve in THIS file's scope.
import { type IServiceManifest, RESOLVER_TOKEN, ServiceManifestClass } from '@rhombus-std/di.core';
import { collectionToken, type IMetricsBuilder, type ITracingBuilder, METRICS_CHANGE_TOKEN_SOURCE_TOKEN,
  METRICS_CONFIGURATION_TOKEN, METRICS_CONFIGURE_TOKEN, METRICS_LISTENER_CONFIGURATION_FACTORY_TOKEN,
  METRICS_OPTIONS_TOKEN, MetricsOptions, TRACING_CHANGE_TOKEN_SOURCE_TOKEN, TRACING_CONFIGURATION_TOKEN,
  TRACING_CONFIGURE_TOKEN, TRACING_LISTENER_CONFIGURATION_FACTORY_TOKEN, TRACING_OPTIONS_TOKEN,
  TracingOptions } from '@rhombus-std/diagnostics.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

import { assembleDiagnosticsOptions } from './assemble-diagnostics-options';
// Type-only side effect: the class-side declaration merges that keep the concrete
// MetricsBuilder/TracingBuilder satisfying their OPEN interfaces once the builder
// augmentation members merge in. The RUNTIME install flows through the registry
// -- importing the concrete classes below runs their `@augment` decoration, and the
// registerAugmentations calls (diagnostics.core + the config-augmentation modules)
// feed their prototypes (docs §38). Each concrete class satisfies its interface via
// its own `interface ... extends I` merge beside the class -- no class-side module.
import { MetricListenerConfigurationFactory } from './metrics/configuration/MetricListenerConfigurationFactory';
import { MetricsBuilder } from './metrics/MetricsBuilder';
import { DefaultActivityListenerConfigurationFactory } from './tracing/configuration/DefaultActivityListenerConfigurationFactory';
import { TracingBuilder } from './tracing/TracingBuilder';

// The authored methods merge onto core's `IServiceManifestBase` interface -- the
// surface the public `ServiceManifest` a consumer holds resolves to -- AND onto
// the concrete `ServiceManifestClass`, so the class still SATISFIES `implements
// IServiceManifestBase` once these NEW method names are on the interface.
// `Provider`/`Scopes` are defaulted so each merge matches its target's
// type-parameter list (TS2428 requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface IServiceManifestBase<Scopes extends string = 'singleton', Provider = unknown> {
    /**
     * Registers the metrics options assembly and, if `configure` is supplied,
     * runs it over a concrete {@link IMetricsBuilder}. After this call resolving
     * {@link METRICS_OPTIONS_TOKEN} yields an `Options<MetricsOptions>` assembled
     * from every rule / config-bind step registered through the builder, reactive
     * to configuration reloads. Mirrors `MetricsServiceExtensions.AddMetrics`
     * (the listener/subscription runtime it also wires has no analog here).
     */
    addMetrics(configure?: Func<[IMetricsBuilder], void>): this;
    /**
     * Registers the tracing options assembly and, if `configure` is supplied,
     * runs it over a concrete {@link ITracingBuilder}. After this call resolving
     * {@link TRACING_OPTIONS_TOKEN} yields an `Options<TracingOptions>` assembled
     * from every rule / config-bind step registered through the builder, reactive
     * to configuration reloads. Mirrors `TracingServiceExtensions.AddTracing`.
     */
    addTracing(configure?: Func<[ITracingBuilder], void>): this;
  }

  interface ServiceManifestClass<Scopes extends string = 'singleton'> {
    addMetrics(configure?: Func<[IMetricsBuilder], void>): this;
    addTracing(configure?: Func<[ITracingBuilder], void>): this;
  }
}

// One named object literal per ME static class (docs §28): `addMetrics` mirrors
// `MetricsServiceExtensions`, `addTracing` mirrors `TracingServiceExtensions` --
// two ME classes over the same ServiceManifest receiver, so two literals.
// Installed as prototype methods (the primary path) via the OPEN-set registry
// (registerAugmentations below, docs §38) AND exported so the member is the
// standalone form.
export const MetricsServiceExtensions = {
  addMetrics(
    manifest: ServiceManifestClass<string>,
    configure?: Func<[IMetricsBuilder], void>,
  ): ServiceManifestClass<string> {
    // Register the resolvable `Options<MetricsOptions>` assembly at singleton
    // scope. Calling addMetrics twice re-registers the (identical) factory --
    // last-wins bare-token resolution keeps that correct; the reference guards it
    // with TryAdd, a `has`/`try*` surface di.core does not expose (options.augmentations'
    // addOptions has the same benign behavior). The factory takes the live
    // provider view via a RESOLVER_TOKEN slot, exactly like assembleOptions.
    manifest.addFactory(
      METRICS_OPTIONS_TOKEN,
      (resolver) =>
        assembleDiagnosticsOptions(
          resolver,
          METRICS_CONFIGURE_TOKEN,
          METRICS_CHANGE_TOKEN_SOURCE_TOKEN,
          () => new MetricsOptions(),
        ),
      [[RESOLVER_TOKEN]],
    ).as('singleton');
    // The per-listener configuration factory (the reference's TryAddSingleton of
    // IMetricListenerConfigurationFactory): ctor-injected with the collection of
    // every MetricsConfiguration marker addMetricsConfiguration registered.
    manifest.add(
      METRICS_LISTENER_CONFIGURATION_FACTORY_TOKEN,
      MetricListenerConfigurationFactory,
      [[collectionToken(METRICS_CONFIGURATION_TOKEN)]],
    ).as('singleton');
    if (configure) {
      configure(new MetricsBuilder(manifest));
    }
    return manifest;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

export const TracingServiceExtensions = {
  addTracing(
    manifest: ServiceManifestClass<string>,
    configure?: Func<[ITracingBuilder], void>,
  ): ServiceManifestClass<string> {
    manifest.addFactory(
      TRACING_OPTIONS_TOKEN,
      (resolver) =>
        assembleDiagnosticsOptions(
          resolver,
          TRACING_CONFIGURE_TOKEN,
          TRACING_CHANGE_TOKEN_SOURCE_TOKEN,
          () => new TracingOptions(),
        ),
      [[RESOLVER_TOKEN]],
    ).as('singleton');
    // The per-listener configuration factory (the reference's TryAddSingleton of
    // ActivityListenerConfigurationFactory): ctor-injected with the collection of
    // every TracingConfiguration marker addTracingConfiguration registered.
    manifest.add(
      TRACING_LISTENER_CONFIGURATION_FACTORY_TOKEN,
      DefaultActivityListenerConfigurationFactory,
      [[collectionToken(TRACING_CONFIGURATION_TOKEN)]],
    ).as('singleton');
    if (configure) {
      configure(new TracingBuilder(manifest));
    }
    return manifest;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

// OPEN receiver: register both sets against di.core's ServiceManifest token
// (docs §38). The `ServiceManifestClass` decorated `@augment(nameof<IServiceManifest>())`
// in di.core pulls `addMetrics`/`addTracing` onto its prototype.
registerAugmentations(nameof<IServiceManifest>(), MetricsServiceExtensions);
registerAugmentations(nameof<IServiceManifest>(), TracingServiceExtensions);

// The concrete builders (mirrors the reference private MetricsBuilder/TracingBuilder,
// exported here so a no-augmentation consumer can construct one directly).
export { MetricsBuilder } from './metrics/MetricsBuilder';
export { TracingBuilder } from './tracing/TracingBuilder';

// The config-binding augmentation sets. Their receiver is the family's OWN
// builder interface; each self-registers against the builder token (docs §38) so
// the `@augment`'d MetricsBuilder/TracingBuilder gain the instance-method form,
// so both `MetricsBuilderConfigurationExtensions.addMetricsConfiguration(builder, cfg)`
// and `builder.addMetricsConfiguration(cfg)` work. The method form is primary.
// Re-exporting the consts also runs each module's registerAugmentations side effect.
export { MetricsBuilderConfigurationExtensions } from './metrics/configuration/metrics-builder-configuration-augmentations';
export { TracingBuilderConfigurationExtensions } from './tracing/configuration/tracing-builder-configuration-augmentations';

// The config-bind ConfigureOptions steps (the reference's internal
// Metrics/TracingConfigureOptions), exposed so a plugin-less consumer can bind a
// configuration section without the addMetricsConfiguration wrapper.
export { MetricsConfigureOptions } from './metrics/configuration/MetricsConfigureOptions';
export { TracingConfigureOptions } from './tracing/configuration/TracingConfigureOptions';

// The per-listener configuration factories. `addMetrics`/`addTracing` register
// the concrete factory at METRICS/TRACING_LISTENER_CONFIGURATION_FACTORY_TOKEN;
// a consumer resolves it as IMetricListenerConfigurationFactory /
// ActivityListenerConfigurationFactory and asks for a listener's merged view.
// The concrete factories and the Metrics/TracingConfiguration markers are
// internal in the reference, exposed here (like the ConfigureOptions steps
// above) so a plugin-less consumer can wire the same path by hand.
export type { IMetricListenerConfigurationFactory } from './metrics/configuration/IMetricListenerConfigurationFactory';
export { MetricListenerConfigurationFactory } from './metrics/configuration/MetricListenerConfigurationFactory';
export { MetricsConfiguration } from './metrics/configuration/MetricsConfiguration';
export { ActivityListenerConfigurationFactory } from './tracing/configuration/ActivityListenerConfigurationFactory';
export { DefaultActivityListenerConfigurationFactory } from './tracing/configuration/DefaultActivityListenerConfigurationFactory';
export { TracingConfiguration } from './tracing/configuration/TracingConfiguration';
