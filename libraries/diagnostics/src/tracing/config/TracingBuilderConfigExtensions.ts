// The tracing analog of MetricsBuilderConfigExtensions.

import type { IConfig } from '@rhombus-std/config.core';
import { type ITracingBuilder, TRACING_CHANGE_TOKEN_SOURCE_TOKEN, TRACING_CONFIGURATION_TOKEN,
  TRACING_CONFIGURE_TOKEN } from '@rhombus-std/diagnostics.core';
import { ConfigChangeTokenSource } from '@rhombus-std/options.augmentations';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { tokenfor } from '@rhombus-std/primitives.extras';

import { TracingConfig } from './TracingConfig';
import { TracingConfigureOptions } from './TracingConfigureOptions';

/** The `TracingBuilderConfigExtensions` augmentation set for {@link ITracingBuilder}. */
export const TracingBuilderConfigExtensions = {
  /** Reads tracing enablement rules from `config` and configures which activity sources and activities are enabled. */
  addTracingConfig(builder: ITracingBuilder, config: IConfig): ITracingBuilder {
    builder.services = builder.services.addValue(TRACING_CONFIGURE_TOKEN, new TracingConfigureOptions(config));
    builder.services = builder.services.addValue(TRACING_CHANGE_TOKEN_SOURCE_TOKEN,
      new ConfigChangeTokenSource(config));
    builder.services = builder.services.addValue(TRACING_CONFIGURATION_TOKEN, new TracingConfig(config));
    return builder;
  },
} satisfies AugmentationSet<ITracingBuilder>;

// Self-registration for the config-binding member of the OPEN `ITracingBuilder`
// receiver. Lives downstream (its `IConfig` dep keeps it out of
// diagnostics.core), so its interface-side merge and its registerAugmentations
// call live here beside it -- separate from the listener/rule members
// registering from diagnostics.core against the same token.
//
// The merge targets the package BARREL (`@rhombus-std/diagnostics.core`),
// matching diagnostics.core's own listener/rule merge -- keeping every site for
// this interface on one module file so the concrete builders still satisfy
// `implements ITracingBuilder`.
declare module '@rhombus-std/diagnostics.core' {
  interface ITracingBuilder {
    addTracingConfig(config: IConfig): this;
  }
}

registerAugmentations(tokenfor<ITracingBuilder>(), TracingBuilderConfigExtensions);
