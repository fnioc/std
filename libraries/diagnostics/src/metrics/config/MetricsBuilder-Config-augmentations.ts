// Registers the config-binding pipeline the metrics options assembly reads: an
// IConfigureOptions step (the MetricsConfigureOptions parse) plus a
// ConfigChangeTokenSource wired to the configuration's reload token, so the
// assembled reactive `IOptions<MetricsOptions>` re-parses on reload. Each call
// also registers a MetricsConfig collection value, which the
// MetricListenerConfigFactory `addMetrics` registers enumerates to build each
// listener's merged configuration view.

import type { IConfig } from '@rhombus-std/config.core';
import { ConstantType } from '@rhombus-std/di.core';
import { type IMetricsBuilder, MetricsOptions } from '@rhombus-std/diagnostics.core';
import type { IConfigureOptions } from '@rhombus-std/options';
import { ConfigChangeTokenSource, type IOptionsChangeTokenSource } from '@rhombus-std/options.augmentations';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/type-helpers';

import { MetricsConfig } from './MetricsConfig';
import { MetricsConfigureOptions } from './MetricsConfigureOptions';

/** The config-binding member of {@link IMetricsBuilder}. */
export namespace MetricsBuilderConfigAugmentations {
  /** Reads metrics enablement rules from `config` and configures which meters, instruments, and listeners are enabled. */
  export function addMetricsConfig<Self extends IMetricsBuilder>(this: Self, config: IConfig): Self {
    this.services = this.services.add(typefor<IConfigureOptions<MetricsOptions>>(), new MetricsConfigureOptions(config), ConstantType);
    this.services = this.services.add(typefor<IOptionsChangeTokenSource<MetricsOptions>>(), new ConfigChangeTokenSource(config), ConstantType);
    this.services = this.services.add(typefor<MetricsConfig>(), new MetricsConfig(config), ConstantType);
    return this;
  }
}

// The merge targets the package BARREL (`@rhombus-std/diagnostics.core`),
// matching diagnostics.core's own listener/rule merge -- so every merge site for
// this interface names one publish-resolvable specifier.
declare module '@rhombus-std/diagnostics.core' {
  interface IMetricsBuilder extends Flatten<typeof MetricsBuilderConfigAugmentations> {}
}

// Registered against the same OPEN token diagnostics.core's listener/rule
// members use; this member lives downstream because its `IConfig` dependency
// keeps it out of diagnostics.core. The concrete builder pulls both bags.
registerAugmentations<IMetricsBuilder>(MetricsBuilderConfigAugmentations);
