// The tracing analog of MetricsBuilder-Config-augmentations.

import type { IConfig } from '@rhombus-std/config.core';
import { type ITracingBuilder, TracingOptions } from '@rhombus-std/diagnostics.core';
import type { IConfigureOptions } from '@rhombus-std/options';
import { ConfigChangeTokenSource, type IOptionsChangeTokenSource } from '@rhombus-std/options.augmentations';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/types';

import { TracingConfig } from './TracingConfig';
import { TracingConfigureOptions } from './TracingConfigureOptions';

/** The config-binding member of {@link ITracingBuilder}. */
export namespace TracingBuilderConfigAugmentations {
  /** Reads tracing enablement rules from `config` and configures which activity sources and activities are enabled. */
  export function addTracingConfig<Self extends ITracingBuilder>(this: Self, config: IConfig): Self {
    this.services = this.services.addValue(typefor<IConfigureOptions<TracingOptions>>(), new TracingConfigureOptions(config));
    this.services = this.services.addValue(typefor<IOptionsChangeTokenSource<TracingOptions>>(), new ConfigChangeTokenSource(config));
    this.services = this.services.addValue(typefor<TracingConfig>(), new TracingConfig(config));
    return this;
  }
}

// The merge targets the package BARREL (`@rhombus-std/diagnostics.core`),
// matching diagnostics.core's own listener/rule merge -- so every merge site for
// this interface names one publish-resolvable specifier.
declare module '@rhombus-std/diagnostics.core' {
  interface ITracingBuilder extends Flatten<typeof TracingBuilderConfigAugmentations> {}
}

// Registered against the same OPEN token diagnostics.core's listener/rule
// members use; this member lives downstream because its `IConfig` dependency
// keeps it out of diagnostics.core. The concrete builder pulls both bags.
registerAugmentations<ITracingBuilder>(TracingBuilderConfigAugmentations);
