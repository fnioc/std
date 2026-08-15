// The tracing analog of MetricsBuilder-Config-augmentations.

import type { IConfig } from '@rhombus-std/config.core';
import { type ITracingBuilder, TRACING_CHANGE_TOKEN_SOURCE_TYPE, TRACING_CONFIGURATION_TYPE,
  TRACING_CONFIGURE_TYPE } from '@rhombus-std/diagnostics.core';
import { ConfigChangeTokenSource } from '@rhombus-std/options.augmentations';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Flatten } from '@rhombus-toolkit/type-helpers';

import { TracingConfig } from './TracingConfig';
import { TracingConfigureOptions } from './TracingConfigureOptions';

/** The config-binding member of {@link ITracingBuilder}. */
export namespace TracingBuilderConfigAugmentations {
  /** Reads tracing enablement rules from `config` and configures which activity sources and activities are enabled. */
  export function addTracingConfig<Self extends ITracingBuilder>(this: Self, config: IConfig): Self {
    this.services = this.services.addValue(TRACING_CONFIGURE_TYPE, new TracingConfigureOptions(config));
    this.services = this.services.addValue(TRACING_CHANGE_TOKEN_SOURCE_TYPE, new ConfigChangeTokenSource(config));
    this.services = this.services.addValue(TRACING_CONFIGURATION_TYPE, new TracingConfig(config));
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
