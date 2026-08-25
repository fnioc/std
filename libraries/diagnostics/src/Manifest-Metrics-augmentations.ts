// `addMetrics` registers the metrics options assembly onto di.core's `Manifest`
// and, if a configure delegate is supplied, runs it over a concrete
// {@link IMetricsBuilder}.
//
// `Manifest` is not a class this package owns, so this follows the
// augmentation-registry path: register the set against the shared
// `typefor<Manifest>()` type and declaration-merge the method onto di.core's
// `Manifest` interface; the `@augment`-decorated `DefaultManifest` (in
// di.core) pulls the member onto its prototype.

// `Func`, `IMetricsBuilder`, `IServiceProvider`, `Manifest` are named imports
// (not member references inside the augmentation block) because unqualified
// names in a `declare module` body resolve in THIS file's scope.
import { type IServiceProvider, type Manifest } from '@rhombus-std/di.core';
import { collectionType, type IMetricsBuilder, MetricsOptions } from '@rhombus-std/diagnostics.core';
import type { IConfigureOptions, IOptions } from '@rhombus-std/options';
import type { IOptionsChangeTokenSource } from '@rhombus-std/options.augmentations';
import { Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { assembleDiagnosticsOptions } from './assemble-diagnostics-options';
import type { IMetricListenerConfigFactory } from './metrics/config/IMetricListenerConfigFactory';
import { MetricListenerConfigFactory } from './metrics/config/MetricListenerConfigFactory';
import type { MetricsConfig } from './metrics/config/MetricsConfig';
import { MetricsBuilder } from './metrics/MetricsBuilder';

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
      const builder = new MetricsBuilder(m);
      configure(builder);
      // The chain is immutable: everything `configure` registered lives on the
      // manifest the BUILDER now holds, not on `m`.
      m = builder.services;
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

// OPEN receiver: register against di.core's `Manifest` type. The
// `DefaultManifest` decorated `@augment(typefor<Manifest>())` in di.core pulls
// `addMetrics` onto its prototype.
registerAugmentations<Manifest<unknown>>(ServiceManifestMetricsAugmentations);
