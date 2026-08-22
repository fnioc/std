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
import { type IServiceProvider, type Manifest } from '@rhombus-std/di.core';
import { collectionType, type IMetricsBuilder, type ITracingBuilder, MetricsOptions, TracingOptions } from '@rhombus-std/diagnostics.core';
import type { IConfigureOptions, IOptions } from '@rhombus-std/options';
import type { IOptionsChangeTokenSource } from '@rhombus-std/options.augmentations';
import { Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';

import { assembleDiagnosticsOptions } from './assemble-diagnostics-options';
// Type-only side effect: the class-side declaration merges that keep the concrete
// MetricsBuilder/TracingBuilder satisfying their OPEN interfaces once the builder
// augmentation members merge in. The RUNTIME install flows through the registry
// -- importing the concrete classes below runs their `@augment` decoration, and the
// registerAugmentations calls (diagnostics.core + the config-augmentation modules)
// feed their prototypes. Each concrete class satisfies its interface via its own
// `interface ... extends I` merge beside the class -- no class-side module.
import type { IMetricListenerConfigFactory } from './metrics/config/IMetricListenerConfigFactory';
import { MetricListenerConfigFactory } from './metrics/config/MetricListenerConfigFactory';
import type { MetricsConfig } from './metrics/config/MetricsConfig';
import { MetricsBuilder } from './metrics/MetricsBuilder';
import type { ActivityListenerConfigFactory } from './tracing/config/ActivityListenerConfigFactory';
import { DefaultActivityListenerConfigFactory } from './tracing/config/DefaultActivityListenerConfigFactory';
import type { TracingConfig } from './tracing/config/TracingConfig';
import { TracingBuilder } from './tracing/TracingBuilder';

// `addMetrics` and `addTracing` are two separate namespaces -- one member
// each -- even though both target the same ServiceManifest receiver, since each
// installs independently and a consumer may pull in only one.
export namespace ServiceManifestMetricsAugmentations {
  /**
   * Registers the metrics options assembly and, if `configure` is supplied,
   * runs it over a concrete {@link IMetricsBuilder}. After this call resolving
   * `IOptions<MetricsOptions>` yields the assembly built
   * from every rule / config-bind step registered through the builder, reactive
   * to configuration reloads.
   */
  export function addMetrics(this: Manifest<unknown>, configure?: Func<[IMetricsBuilder], void>): Manifest<unknown> {
    // Register the resolvable `IOptions<MetricsOptions>` assembly at singleton
    // scope. Calling addMetrics twice re-registers the (identical) factory --
    // last-wins bare-token resolution keeps that correct. The factory takes the
    // live provider view via an `IServiceProvider` slot, exactly like assembleOptions.
    let m: Manifest<unknown> = this.add(typefor<IOptions<MetricsOptions>>(),
      (resolver) => assembleDiagnosticsOptions(resolver, typefor<IConfigureOptions<MetricsOptions>>(), typefor<IOptionsChangeTokenSource<MetricsOptions>>(), () => new MetricsOptions()),
      Type.func(typefor<IOptions<MetricsOptions>>(), [[typefor<IServiceProvider>()]]), 'singleton');
    // The per-listener configuration factory, ctor-injected with the collection
    // of every MetricsConfig marker addMetricsConfig registered.
    m = m.add(typefor<IMetricListenerConfigFactory>(), MetricListenerConfigFactory, Type.ctor(typefor<IMetricListenerConfigFactory>(), [[collectionType(typefor<MetricsConfig>())]]), 'singleton');
    if (configure) {
      // The cast works around a TS structural-comparison depth limit -- see
      // clearMetricsListeners in @rhombus-std/diagnostics.core for the full
      // explanation. `MetricsBuilder`'s ctor takes the Lifetime-erased
      // `Manifest`; `m`'s huge `addClass`/`addFactory` overload surface
      // (di.core's descriptor augmentation merge) pushes the
      // direct-assignment check past TS's recursion budget.
      const builder = new MetricsBuilder(m as Manifest<any>);
      configure(builder);
      // The chain is immutable: everything `configure` registered lives on the
      // manifest the BUILDER now holds, not on `m`.
      m = builder.services as Manifest<unknown>;
    }
    return m;
  }
}

export namespace ServiceManifestTracingAugmentations {
  /**
   * Registers the tracing options assembly and, if `configure` is supplied,
   * runs it over a concrete {@link ITracingBuilder}. After this call resolving
   * `IOptions<TracingOptions>` yields the assembly built
   * from every rule / config-bind step registered through the builder, reactive
   * to configuration reloads.
   */
  export function addTracing(this: Manifest<unknown>, configure?: Func<[ITracingBuilder], void>): Manifest<unknown> {
    let m: Manifest<unknown> = this.add(typefor<IOptions<TracingOptions>>(),
      (resolver) => assembleDiagnosticsOptions(resolver, typefor<IConfigureOptions<TracingOptions>>(), typefor<IOptionsChangeTokenSource<TracingOptions>>(), () => new TracingOptions()),
      Type.func(typefor<IOptions<TracingOptions>>(), [[typefor<IServiceProvider>()]]), 'singleton');
    // The per-listener configuration factory, ctor-injected with the collection
    // of every TracingConfig marker addTracingConfig registered.
    m = m.add(typefor<ActivityListenerConfigFactory>(), DefaultActivityListenerConfigFactory, Type.ctor(typefor<ActivityListenerConfigFactory>(), [[collectionType(typefor<TracingConfig>())]]),
      'singleton');
    if (configure) {
      // See the addMetrics cast above for why this is needed.
      const builder = new TracingBuilder(m as Manifest<any>);
      configure(builder);
      // Immutable chain -- read back what the builder registered (see addMetrics).
      m = builder.services as Manifest<unknown>;
    }
    return m;
  }
}

// `Lifetime` is defaulted so the merge matches its target's type-parameter list
// (TS2428 requires identical parameters).
declare module '@rhombus-std/di.core' {
  interface Manifest<Lifetime> {
    addMetrics(configure?: Func<[IMetricsBuilder], void>): Manifest<Lifetime>;
  }
}

declare module '@rhombus-std/di.core' {
  interface Manifest<Lifetime> {
    addTracing(configure?: Func<[ITracingBuilder], void>): Manifest<Lifetime>;
  }
}

// OPEN receiver: register both sets against di.core's `Manifest` type. The
// `DefaultManifest` decorated `@augment(typefor<Manifest>())` in di.core pulls
// `addMetrics`/`addTracing` onto its prototype.
registerAugmentations<Manifest<any>>(ServiceManifestMetricsAugmentations);
registerAugmentations<Manifest<any>>(ServiceManifestTracingAugmentations);

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
