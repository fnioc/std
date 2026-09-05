// Each subsystem's registrations, published as a manifest built on the narrowest
// lifetime vocabulary it actually uses. A consumer merges one into their own
// manifest -- `services.add(getMetricsManifest())` -- and that merge is what
// checks their vocabulary covers what these registrations ask for.

import { type IServiceProvider, Manifest } from '@rhombus-std/di.core';
import { type IMetricsBuilder, type ITracingBuilder, MetricsOptions, TracingOptions } from '@rhombus-std/diagnostics.core';
import type { IConfigureOptions, IOptions } from '@rhombus-std/options';
import type { IOptionsChangeTokenSource } from '@rhombus-std/options.augmentations';
import { typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/types';
import { assembleDiagnosticsOptions } from './assemble-diagnostics-options';
import type { IMetricListenerConfigFactory } from './metrics/config/IMetricListenerConfigFactory';
import { MetricListenerConfigFactory } from './metrics/config/MetricListenerConfigFactory';
import type {} from './metrics/config/MetricsConfig';
import { MetricsBuilder } from './metrics/MetricsBuilder';
import type { ActivityListenerConfigFactory } from './tracing/config/ActivityListenerConfigFactory';
import { DefaultActivityListenerConfigFactory } from './tracing/config/DefaultActivityListenerConfigFactory';
import type {} from './tracing/config/TracingConfig';
import { TracingBuilder } from './tracing/TracingBuilder';

function metricsOptions(sp: IServiceProvider) {
  return assembleDiagnosticsOptions(sp, typefor<IConfigureOptions<MetricsOptions>>(), typefor<IOptionsChangeTokenSource<MetricsOptions>>(), () => new MetricsOptions());
}

function tracingOptions(sp: IServiceProvider) {
  return assembleDiagnosticsOptions(sp, typefor<IConfigureOptions<TracingOptions>>(), typefor<IOptionsChangeTokenSource<TracingOptions>>(), () => new TracingOptions());
}

/**
 * The metrics registrations: the `IOptions<MetricsOptions>` assembly, and the
 * per-listener configuration factory fed by every configuration `addMetricsConfig`
 * bound.
 *
 * @remarks
 * Resolving `IOptions<MetricsOptions>` yields the assembly built from every rule
 * and config-bind step registered through the builder, reactive to configuration
 * reloads. `configure` runs over a concrete {@link IMetricsBuilder}, and whatever
 * it registers is part of the returned manifest.
 */
export function getMetricsManifest(configure?: Func<[IMetricsBuilder], void>) {
  const m = Manifest.empty<'singleton'>()
    .add<IOptions<MetricsOptions>>(metricsOptions, 'singleton')
    .add<IMetricListenerConfigFactory>(MetricListenerConfigFactory, 'singleton');
  return MetricsBuilder.run(m, configure);
}

/**
 * The tracing registrations: the `IOptions<TracingOptions>` assembly, and the
 * per-listener configuration factory fed by every configuration `addTracingConfig`
 * bound.
 *
 * @remarks
 * Resolving `IOptions<TracingOptions>` yields the assembly built from every rule
 * and config-bind step registered through the builder, reactive to configuration
 * reloads. `configure` runs over a concrete {@link ITracingBuilder}, and whatever
 * it registers is part of the returned manifest.
 */
export function getTracingManifest(configure?: Func<[ITracingBuilder], void>) {
  const m = Manifest.empty<'singleton'>()
    .add<IOptions<TracingOptions>>(tracingOptions, 'singleton')
    .add<ActivityListenerConfigFactory>(DefaultActivityListenerConfigFactory, 'singleton');
  return TracingBuilder.run(m, configure);
}
