// Registers the config-binding pipeline the metrics options assembly reads: an
// IConfigureOptions step (the MetricsConfigureOptions parse) plus a
// ConfigChangeTokenSource wired to the configuration's reload token, so the
// assembled reactive `IOptions<MetricsOptions>` re-parses on reload. Each call
// also registers a METRICS_CONFIGURATION_TOKEN collection value, which the
// MetricListenerConfigFactory `addMetrics` registers enumerates to build each
// listener's merged configuration view.

import type { IConfig } from '@rhombus-std/config.core';
import { type IMetricsBuilder, METRICS_CHANGE_TOKEN_SOURCE_TOKEN, METRICS_CONFIGURATION_TOKEN,
  METRICS_CONFIGURE_TOKEN } from '@rhombus-std/diagnostics.core';
import { ConfigChangeTokenSource } from '@rhombus-std/options.augmentations';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';

import { MetricsConfig } from './MetricsConfig';
import { MetricsConfigureOptions } from './MetricsConfigureOptions';

/** The `MetricsBuilderConfigExtensions` augmentation set for {@link IMetricsBuilder}. */
export const MetricsBuilderConfigExtensions = {
  /** Reads metrics enablement rules from `config` and configures which meters, instruments, and listeners are enabled. */
  addMetricsConfig(builder: IMetricsBuilder, config: IConfig): IMetricsBuilder {
    builder.services = builder.services.addValue(METRICS_CONFIGURE_TOKEN, new MetricsConfigureOptions(config));
    builder.services = builder.services.addValue(METRICS_CHANGE_TOKEN_SOURCE_TOKEN,
      new ConfigChangeTokenSource(config));
    builder.services = builder.services.addValue(METRICS_CONFIGURATION_TOKEN, new MetricsConfig(config));
    return builder;
  },
} satisfies AugmentationSet<IMetricsBuilder>;

// Self-registration for the config-binding member of the OPEN `IMetricsBuilder`
// receiver. This const lives downstream (its `IConfig` dep keeps it out of
// diagnostics.core), so its interface-side merge and its registerAugmentations
// call live here beside it -- separate from the listener/rule members, which
// register from diagnostics.core against the same token. The concrete
// `MetricsBuilder` (@augment'd) pulls both bags' members.
//
// The merge targets the package BARREL (`@rhombus-std/diagnostics.core`),
// matching diagnostics.core's own listener/rule merge -- keeping every site for
// this interface on one module file so the concrete builders still satisfy
// `implements IMetricsBuilder`.
declare module '@rhombus-std/diagnostics.core' {
  interface IMetricsBuilder {
    addMetricsConfig(config: IConfig): this;
  }
}

registerAugmentations(tokenfor<IMetricsBuilder>(), MetricsBuilderConfigExtensions);
