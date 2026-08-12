// Registers the config-binding pipeline the metrics options assembly reads: an
// IConfigureOptions step (the MetricsConfigureOptions parse) plus a
// ConfigChangeTokenSource wired to the configuration's reload token, so the
// assembled reactive `IOptions<MetricsOptions>` re-parses on reload. Each call
// also registers a METRICS_CONFIGURATION_TYPE collection value, which the
// MetricListenerConfigFactory `addMetrics` registers enumerates to build each
// listener's merged configuration view.

import type { IConfig } from '@rhombus-std/config.core';
import { type IMetricsBuilder, METRICS_CHANGE_TOKEN_SOURCE_TYPE, METRICS_CONFIGURATION_TYPE,
  METRICS_CONFIGURE_TYPE } from '@rhombus-std/diagnostics.core';
import { ConfigChangeTokenSource } from '@rhombus-std/options.augmentations';
import { type AugmentationSet2, type Flatten, registerAugmentations } from '@rhombus-std/primitives';
import { typefor } from '@rhombus-std/primitives.extras';

import { MetricsConfig } from './MetricsConfig';
import { MetricsConfigureOptions } from './MetricsConfigureOptions';

interface IMetricsBuilderConfigAugmentations {
  /** Reads metrics enablement rules from `config` and configures which meters, instruments, and listeners are enabled. */
  addMetricsConfig(config: IConfig): this;
}

// The merge targets the package BARREL (`@rhombus-std/diagnostics.core`),
// matching diagnostics.core's own listener/rule merge -- so every merge site for
// this interface names one publish-resolvable specifier.
declare module '@rhombus-std/diagnostics.core' {
  interface IMetricsBuilder extends IMetricsBuilderConfigAugmentations {}
}

/** The config-binding member of {@link IMetricsBuilder}. */
export const MetricsBuilderConfigAugmentations: AugmentationSet2<IMetricsBuilder,
  Flatten<IMetricsBuilderConfigAugmentations>> = {
    addMetricsConfig(builder, config) {
      builder.services = builder.services.addValue(METRICS_CONFIGURE_TYPE, new MetricsConfigureOptions(config));
      builder.services = builder.services.addValue(METRICS_CHANGE_TOKEN_SOURCE_TYPE,
        new ConfigChangeTokenSource(config));
      builder.services = builder.services.addValue(METRICS_CONFIGURATION_TYPE, new MetricsConfig(config));
      return builder;
    },
  };

// Registered against the same OPEN token diagnostics.core's listener/rule
// members use; this member lives downstream because its `IConfig` dependency
// keeps it out of diagnostics.core. The concrete builder pulls both bags.
registerAugmentations(typefor<IMetricsBuilder>(), MetricsBuilderConfigAugmentations);
