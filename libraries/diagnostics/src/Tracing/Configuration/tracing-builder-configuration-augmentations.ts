// TracingBuilderConfigurationExtensions -- ported from MED.Tracing's
// `TracingBuilderConfigurationExtensions.AddConfiguration`. The tracing analog of
// MetricsBuilderConfigurationExtensions; authored as a named object literal
// (docs §28) and installed onto the concrete builder in ./builder-augmentations.

import type { IConfiguration } from "@rhombus-std/config";
import {
  type ITracingBuilder,
  TRACING_CHANGE_TOKEN_SOURCE_TOKEN,
  TRACING_CONFIGURATION_TOKEN,
  TRACING_CONFIGURE_TOKEN,
} from "@rhombus-std/diagnostics.core";
import { ConfigurationChangeTokenSource } from "@rhombus-std/options.augmentations";
import { type AugmentationSet, registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";

import { TracingConfiguration } from "./TracingConfiguration";
import { TracingConfigureOptions } from "./TracingConfigureOptions";

/** The `TracingBuilderConfigurationExtensions` augmentation set for {@link ITracingBuilder} (docs §28). */
export const TracingBuilderConfigurationExtensions = {
  /**
   * Reads tracing enablement rules from `configuration` and configures which
   * activity sources and activities are enabled. Mirrors
   * `TracingBuilderConfigurationExtensions.AddConfiguration`.
   */
  addTracingConfiguration(builder: ITracingBuilder, configuration: IConfiguration): ITracingBuilder {
    builder.services.addValue(TRACING_CONFIGURE_TOKEN, new TracingConfigureOptions(configuration));
    builder.services.addValue(TRACING_CHANGE_TOKEN_SOURCE_TOKEN, new ConfigurationChangeTokenSource(configuration));
    builder.services.addValue(TRACING_CONFIGURATION_TOKEN, new TracingConfiguration(configuration));
    return builder;
  },
} satisfies AugmentationSet<ITracingBuilder>;

// Self-registration for the config-binding member of the OPEN `ITracingBuilder`
// receiver (docs §38). Lives downstream (its `IConfiguration` dep keeps it out of
// diagnostics.core), so per rule §38.6 its interface-side merge and its
// registerAugmentations call live here beside it -- separate from the
// listener/rule members registering from diagnostics.core against the same token.
//
// The merge targets the DECLARING module (via the internal/* subpath), not the
// package barrel: every interface-side merge for one interface must resolve to
// the same module file, or TS treats the accumulated `this`-returning members
// as having unrelated this-types and the concrete builders stop satisfying
// `implements ITracingBuilder`.
declare module "@rhombus-std/diagnostics.core/internal/Tracing/ITracingBuilder" {
  interface ITracingBuilder {
    addTracingConfiguration(configuration: IConfiguration): this;
  }
}

registerAugmentations(nameof<ITracingBuilder>(), TracingBuilderConfigurationExtensions);
