// Public entry point for @rhombus-std/diagnostics.
//
// Ships the concrete MetricsBuilder/TracingBuilder, the config-binding
// augmentation sets (Metrics/TracingBuilderConfigAugmentations), the config-bind
// IConfigureOptions steps, and -- as a SIDE EFFECT of importing this module --
// installs the `addMetrics`/`addTracing` fluent authoring methods onto di.core's
// registration builder AND the metrics/tracing builder augmentations as instance
// methods on the family's own builders (every augmentation available as both a
// standalone function and a method). A consumer who only wants the sugar takes
// a bare side-effect import: `import "@rhombus-std/diagnostics";`. This package
// MUST keep `"sideEffects": true` so a bundler cannot tree-shake the
// augmentation away.
//
// `addMetrics`/`addTracing` register the resolvable `IOptions<MetricsOptions>` /
// `IOptions<TracingOptions>` assembly (so a consumer can resolve the assembled,
// config-reactive rule set), the per-listener configuration factory (which
// merges the `{listenerName}` sections of every configuration bound via
// addMetricsConfig/addTracingConfig), and run the consumer's configure callback
// over a concrete builder. There is no listener/subscription runtime behind
// this (no Meter/Instrument/Activity/ActivitySource) -- resolving the
// assembled options is as far as this package goes.

// `Func`, `IMetricsBuilder`/`ITracingBuilder` are named imports (not member
// references inside the augmentation block) because unqualified names in a
// `declare module` body resolve in THIS file's scope.
import { type Manifest, RESOLVER_TYPE } from '@rhombus-std/di.core';
import { collectionType, type IMetricsBuilder, type ITracingBuilder, METRICS_CHANGE_TOKEN_SOURCE_TYPE,
  METRICS_CONFIGURATION_TYPE, METRICS_CONFIGURE_TYPE, METRICS_LISTENER_CONFIGURATION_FACTORY_TYPE, METRICS_OPTIONS_TYPE,
  MetricsOptions, TRACING_CHANGE_TOKEN_SOURCE_TYPE, TRACING_CONFIGURATION_TYPE, TRACING_CONFIGURE_TYPE,
  TRACING_LISTENER_CONFIGURATION_FACTORY_TYPE, TRACING_OPTIONS_TYPE,
  TracingOptions } from '@rhombus-std/diagnostics.core';
import { type Flatten, registerAugmentations, Type } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

import { assembleDiagnosticsOptions } from './assemble-diagnostics-options';
// Type-only side effect: the class-side declaration merges that keep the concrete
// MetricsBuilder/TracingBuilder satisfying their OPEN interfaces once the builder
// augmentation members merge in. The RUNTIME install flows through the registry
// -- importing the concrete classes below runs their `@augment` decoration, and the
// registerAugmentations calls (diagnostics.core + the config-augmentation modules)
// feed their prototypes. Each concrete class satisfies its interface via its own
// `interface ... extends I` merge beside the class -- no class-side module.
import { MetricListenerConfigFactory } from './metrics/config/MetricListenerConfigFactory';
import { MetricsBuilder } from './metrics/MetricsBuilder';
import { DefaultActivityListenerConfigFactory } from './tracing/config/DefaultActivityListenerConfigFactory';
import { TracingBuilder } from './tracing/TracingBuilder';

// `addMetrics` and `addTracing` are two separate namespaces -- one member
// each -- even though both target the same ServiceManifest receiver, since each
// installs independently and a consumer may pull in only one.
export namespace ServiceManifestMetricsAugmentations {
  /**
   * Registers the metrics options assembly and, if `configure` is supplied,
   * runs it over a concrete {@link IMetricsBuilder}. After this call resolving
   * {@link METRICS_OPTIONS_TYPE} yields an `IOptions<MetricsOptions>` assembled
   * from every rule / config-bind step registered through the builder, reactive
   * to configuration reloads.
   */
  export function addMetrics(this: Manifest<string>, configure?: Func<[IMetricsBuilder], void>): Manifest<
    string
  > {
    // Register the resolvable `IOptions<MetricsOptions>` assembly at singleton
    // scope. Calling addMetrics twice re-registers the (identical) factory --
    // last-wins bare-token resolution keeps that correct. The factory takes the
    // live provider view via a RESOLVER_TYPE slot, exactly like assembleOptions.
    let m: Manifest<string> = this.addFactory(METRICS_OPTIONS_TYPE,
      (resolver) =>
        assembleDiagnosticsOptions(resolver, METRICS_CONFIGURE_TYPE, METRICS_CHANGE_TOKEN_SOURCE_TYPE, () =>
          new MetricsOptions()), Type.func(METRICS_OPTIONS_TYPE, [[RESOLVER_TYPE]]), 'singleton');
    // The per-listener configuration factory, ctor-injected with the collection
    // of every MetricsConfig marker addMetricsConfig registered.
    m = m.addClass(METRICS_LISTENER_CONFIGURATION_FACTORY_TYPE, MetricListenerConfigFactory,
      Type.ctor(METRICS_LISTENER_CONFIGURATION_FACTORY_TYPE, [[collectionType(METRICS_CONFIGURATION_TYPE)]]),
      'singleton');
    if (configure) {
      // The cast works around a TS structural-comparison depth limit -- see
      // clearMetricsListeners in @rhombus-std/diagnostics.core for the full
      // explanation. `MetricsBuilder`'s ctor takes the Scopes-erased
      // `Manifest`; `m`'s huge `addClass`/`addFactory` overload surface
      // (di.core's descriptor augmentation merge) pushes the
      // direct-assignment check past TS's recursion budget.
      const builder = new MetricsBuilder(m as Manifest);
      configure(builder);
      // The chain is immutable: everything `configure` registered lives on the
      // manifest the BUILDER now holds, not on `m`.
      m = builder.services as Manifest<string>;
    }
    return m;
  }
}

export namespace ServiceManifestTracingAugmentations {
  /**
   * Registers the tracing options assembly and, if `configure` is supplied,
   * runs it over a concrete {@link ITracingBuilder}. After this call resolving
   * {@link TRACING_OPTIONS_TYPE} yields an `IOptions<TracingOptions>` assembled
   * from every rule / config-bind step registered through the builder, reactive
   * to configuration reloads.
   */
  export function addTracing(this: Manifest<string>, configure?: Func<[ITracingBuilder], void>): Manifest<
    string
  > {
    let m: Manifest<string> = this.addFactory(TRACING_OPTIONS_TYPE,
      (resolver) =>
        assembleDiagnosticsOptions(resolver, TRACING_CONFIGURE_TYPE, TRACING_CHANGE_TOKEN_SOURCE_TYPE, () =>
          new TracingOptions()), Type.func(TRACING_OPTIONS_TYPE, [[RESOLVER_TYPE]]), 'singleton');
    // The per-listener configuration factory, ctor-injected with the collection
    // of every TracingConfig marker addTracingConfig registered.
    m = m.addClass(TRACING_LISTENER_CONFIGURATION_FACTORY_TYPE, DefaultActivityListenerConfigFactory,
      Type.ctor(TRACING_LISTENER_CONFIGURATION_FACTORY_TYPE, [[collectionType(TRACING_CONFIGURATION_TYPE)]]),
      'singleton');
    if (configure) {
      // See the addMetrics cast above for why this is needed.
      const builder = new TracingBuilder(m as Manifest);
      configure(builder);
      // Immutable chain -- read back what the builder registered (see addMetrics).
      m = builder.services as Manifest<string>;
    }
    return m;
  }
}

// `Provider`/`Scopes` are defaulted so the merge matches its target's
// type-parameter list (TS2428 requires identical parameters), even though the
// members do not name `Provider`.
declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string = any> extends Flatten<typeof ServiceManifestMetricsAugmentations> {}
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Scopes extends string = any> extends Flatten<typeof ServiceManifestTracingAugmentations> {}
}

// OPEN receiver: register both sets against di.core's `Manifest` type. The
// `DefaultManifest` decorated `@augment(typefor<Manifest>())` in di.core pulls
// `addMetrics`/`addTracing` onto its prototype.
registerAugmentations(typefor<Manifest>(), ServiceManifestMetricsAugmentations);
registerAugmentations(typefor<Manifest>(), ServiceManifestTracingAugmentations);

// Wholesale re-export of this family's own core (the IMetricsBuilder/
// ITracingBuilder abstractions, the rule/options data model, and the tokens),
// so a consumer depending on the runtime package resolves the abstractions from
// it too; the package's public surface stays a superset of its core's.
export * from '@rhombus-std/diagnostics.core';

// The concrete builders, exported here so a no-augmentation consumer can
// construct one directly.
export * from './metrics/MetricsBuilder';
export * from './tracing/TracingBuilder';

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
// the concrete factory at METRICS/TRACING_LISTENER_CONFIGURATION_FACTORY_TYPE;
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
