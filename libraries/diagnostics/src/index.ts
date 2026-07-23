// Public entry point for @rhombus-std/diagnostics -- the ME.Diagnostics (impl)
// analog.
//
// Ships the concrete MetricsBuilder/TracingBuilder, the config-binding
// augmentation sets (Metrics/TracingBuilderConfigExtensions), the config-bind
// IConfigureOptions steps, and -- as a SIDE EFFECT of importing this module --
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
// ported is registering the resolvable `IOptions<MetricsOptions>` /
// `IOptions<TracingOptions>` assembly (so a consumer can resolve the assembled,
// config-reactive rule set), the per-listener configuration factory
// (IMetricListenerConfigFactory / ActivityListenerConfigFactory,
// which merges the `{listenerName}` sections of every configuration bound via
// addMetricsConfig/addTracingConfig), and running the consumer's
// configure callback over a concrete builder. See the package tbd notes for what
// the missing runtime would add.

// `Func`, `IMetricsBuilder`/`ITracingBuilder` are named imports (not member
// references inside the augmentation block) because unqualified names in a
// `declare module` body resolve in THIS file's scope.
import { type IServiceManifest, type IServiceManifestBase, RESOLVER_TOKEN,
  ServiceManifestClass } from '@rhombus-std/di.core';
import { collectionToken, type IMetricsBuilder, type ITracingBuilder, METRICS_CHANGE_TOKEN_SOURCE_TOKEN,
  METRICS_CONFIGURATION_TOKEN, METRICS_CONFIGURE_TOKEN, METRICS_LISTENER_CONFIGURATION_FACTORY_TOKEN,
  METRICS_OPTIONS_TOKEN, MetricsOptions, TRACING_CHANGE_TOKEN_SOURCE_TOKEN, TRACING_CONFIGURATION_TOKEN,
  TRACING_CONFIGURE_TOKEN, TRACING_LISTENER_CONFIGURATION_FACTORY_TOKEN, TRACING_OPTIONS_TOKEN,
  TracingOptions } from '@rhombus-std/diagnostics.core';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';

import { assembleDiagnosticsOptions } from './assemble-diagnostics-options';
// Type-only side effect: the class-side declaration merges that keep the concrete
// MetricsBuilder/TracingBuilder satisfying their OPEN interfaces once the builder
// augmentation members merge in. The RUNTIME install flows through the registry
// -- importing the concrete classes below runs their `@augment` decoration, and the
// registerAugmentations calls (diagnostics.core + the config-augmentation modules)
// feed their prototypes (docs §38). Each concrete class satisfies its interface via
// its own `interface ... extends I` merge beside the class -- no class-side module.
import { MetricListenerConfigFactory } from './metrics/config/MetricListenerConfigFactory';
import { MetricsBuilder } from './metrics/MetricsBuilder';
import { DefaultActivityListenerConfigFactory } from './tracing/config/DefaultActivityListenerConfigFactory';
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
     * {@link METRICS_OPTIONS_TOKEN} yields an `IOptions<MetricsOptions>` assembled
     * from every rule / config-bind step registered through the builder, reactive
     * to configuration reloads. Mirrors `MetricsServiceExtensions.AddMetrics`
     * (the listener/subscription runtime it also wires has no analog here).
     */
    addMetrics(configure?: Func<[IMetricsBuilder], void>): IServiceManifest<Scopes>;
    /**
     * Registers the tracing options assembly and, if `configure` is supplied,
     * runs it over a concrete {@link ITracingBuilder}. After this call resolving
     * {@link TRACING_OPTIONS_TOKEN} yields an `IOptions<TracingOptions>` assembled
     * from every rule / config-bind step registered through the builder, reactive
     * to configuration reloads. Mirrors `TracingServiceExtensions.AddTracing`.
     */
    addTracing(configure?: Func<[ITracingBuilder], void>): IServiceManifest<Scopes>;
  }

  interface ServiceManifestClass<Scopes extends string = 'singleton'> {
    addMetrics(configure?: Func<[IMetricsBuilder], void>): IServiceManifest<Scopes>;
    addTracing(configure?: Func<[ITracingBuilder], void>): IServiceManifest<Scopes>;
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
  ): IServiceManifest<string> {
    // Register the resolvable `IOptions<MetricsOptions>` assembly at singleton
    // scope. Calling addMetrics twice re-registers the (identical) factory --
    // last-wins bare-token resolution keeps that correct; the reference guards it
    // with TryAdd, a `has`/`try*` surface di.core does not expose (options.augmentations'
    // addOptions has the same benign behavior). The factory takes the live
    // provider view via a RESOLVER_TOKEN slot, exactly like assembleOptions.
    let m: IServiceManifest<string> = manifest.addFactory(
      METRICS_OPTIONS_TOKEN,
      (resolver) =>
        assembleDiagnosticsOptions(
          resolver,
          METRICS_CONFIGURE_TOKEN,
          METRICS_CHANGE_TOKEN_SOURCE_TOKEN,
          () => new MetricsOptions(),
        ),
      [[RESOLVER_TOKEN]],
      'singleton',
    );
    // The per-listener configuration factory (the reference's TryAddSingleton of
    // IMetricListenerConfigFactory): ctor-injected with the collection of
    // every MetricsConfig marker addMetricsConfig registered.
    m = m.addClass(
      METRICS_LISTENER_CONFIGURATION_FACTORY_TOKEN,
      MetricListenerConfigFactory,
      [[collectionToken(METRICS_CONFIGURATION_TOKEN)]],
      'singleton',
    );
    if (configure) {
      // The cast works around a TS structural-comparison depth limit -- see
      // clearMetricsListeners in @rhombus-std/diagnostics.core for the full
      // explanation. `MetricsBuilder`'s ctor takes the Scopes-erased
      // `IServiceManifestBase`; `m`'s huge `addClass`/`addFactory` overload surface
      // (di.core's ServiceManifestDescriptorAugmentations merge) pushes the
      // direct-assignment check past TS's recursion budget.
      const builder = new MetricsBuilder(m as IServiceManifestBase);
      configure(builder);
      // The chain is immutable: everything `configure` registered lives on the
      // manifest the BUILDER now holds, not on `m`.
      m = builder.services as IServiceManifest<string>;
    }
    return m;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

export const TracingServiceExtensions = {
  addTracing(
    manifest: ServiceManifestClass<string>,
    configure?: Func<[ITracingBuilder], void>,
  ): IServiceManifest<string> {
    let m: IServiceManifest<string> = manifest.addFactory(
      TRACING_OPTIONS_TOKEN,
      (resolver) =>
        assembleDiagnosticsOptions(
          resolver,
          TRACING_CONFIGURE_TOKEN,
          TRACING_CHANGE_TOKEN_SOURCE_TOKEN,
          () => new TracingOptions(),
        ),
      [[RESOLVER_TOKEN]],
      'singleton',
    );
    // The per-listener configuration factory (the reference's TryAddSingleton of
    // ActivityListenerConfigFactory): ctor-injected with the collection of
    // every TracingConfig marker addTracingConfig registered.
    m = m.addClass(
      TRACING_LISTENER_CONFIGURATION_FACTORY_TOKEN,
      DefaultActivityListenerConfigFactory,
      [[collectionToken(TRACING_CONFIGURATION_TOKEN)]],
      'singleton',
    );
    if (configure) {
      // See the addMetrics cast above for why this is needed.
      const builder = new TracingBuilder(m as IServiceManifestBase);
      configure(builder);
      // Immutable chain -- read back what the builder registered (see addMetrics).
      m = builder.services as IServiceManifest<string>;
    }
    return m;
  },
} satisfies AugmentationSet<ServiceManifestClass<string>>;

// OPEN receiver: register both sets against di.core's ServiceManifest token
// (docs §38). The `ServiceManifestClass` decorated `@augment(tokenfor<IServiceManifest>())`
// in di.core pulls `addMetrics`/`addTracing` onto its prototype.
registerAugmentations(tokenfor<IServiceManifest>(), MetricsServiceExtensions);
registerAugmentations(tokenfor<IServiceManifest>(), TracingServiceExtensions);

// Wholesale re-export of this family's own core (the IMetricsBuilder/
// ITracingBuilder abstractions, the rule/options data model, and the tokens),
// so a consumer depending on the runtime package resolves the abstractions from
// it too; the package's public surface stays a superset of its core's.
export * from '@rhombus-std/diagnostics.core';

// The concrete builders (mirrors the reference private MetricsBuilder/TracingBuilder,
// exported here so a no-augmentation consumer can construct one directly).
export { MetricsBuilder } from './metrics/MetricsBuilder';
export { TracingBuilder } from './tracing/TracingBuilder';

// The config-binding augmentation sets. Their receiver is the family's OWN
// builder interface; each self-registers against the builder token (docs §38) so
// the `@augment`'d MetricsBuilder/TracingBuilder gain the instance-method form,
// so both `MetricsBuilderConfigExtensions.addMetricsConfig(builder, cfg)`
// and `builder.addMetricsConfig(cfg)` work. The method form is primary.
// Re-exporting the consts also runs each module's registerAugmentations side effect.
export { MetricsBuilderConfigExtensions } from './metrics/config/MetricsBuilderConfigExtensions';
export { TracingBuilderConfigExtensions } from './tracing/config/TracingBuilderConfigExtensions';

// The config-bind IConfigureOptions steps (the reference's internal
// Metrics/TracingConfigureOptions), exposed so a plugin-less consumer can bind a
// configuration section without the addMetricsConfig wrapper.
export { MetricsConfigureOptions } from './metrics/config/MetricsConfigureOptions';
export { TracingConfigureOptions } from './tracing/config/TracingConfigureOptions';

// The per-listener configuration factories. `addMetrics`/`addTracing` register
// the concrete factory at METRICS/TRACING_LISTENER_CONFIGURATION_FACTORY_TOKEN;
// a consumer resolves it as IMetricListenerConfigFactory /
// ActivityListenerConfigFactory and asks for a listener's merged view.
// The concrete factories and the Metrics/TracingConfig markers are
// internal in the reference, exposed here (like the IConfigureOptions steps
// above) so a plugin-less consumer can wire the same path by hand.
export type { IMetricListenerConfigFactory } from './metrics/config/IMetricListenerConfigFactory';
export { MetricListenerConfigFactory } from './metrics/config/MetricListenerConfigFactory';
export { MetricsConfig } from './metrics/config/MetricsConfig';
export { ActivityListenerConfigFactory } from './tracing/config/ActivityListenerConfigFactory';
export { DefaultActivityListenerConfigFactory } from './tracing/config/DefaultActivityListenerConfigFactory';
export { TracingConfig } from './tracing/config/TracingConfig';
