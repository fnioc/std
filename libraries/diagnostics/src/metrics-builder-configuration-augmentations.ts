// MetricsBuilderConfigurationExtensions -- ported from MED.Metrics's
// `MetricsBuilderConfigurationExtensions.AddConfiguration`. Targets the family's
// own IMetricsBuilder; authored as a named object literal (docs §28) and
// installed onto the concrete builder in ./builder-augmentations.
//
// Registers the config-binding pipeline the assembly reads, following the
// @rhombus-std/options.augmentations config-binding pattern: a ConfigureOptions
// step (the MetricsConfigureOptions parse) plus a ConfigurationChangeTokenSource
// wired to the configuration's reload token, so the assembled reactive
// `Options<MetricsOptions>` re-parses on reload. (The reference additionally
// registers a `MetricsConfiguration` marker singleton consumed by the metrics
// listener runtime; there is no such runtime here, so it is omitted.)

import type { IConfiguration } from "@rhombus-std/config";
import { METRICS_CHANGE_TOKEN_SOURCE_TOKEN, METRICS_CONFIGURE_TOKEN } from "@rhombus-std/diagnostics.core";
import type { IMetricsBuilder } from "@rhombus-std/diagnostics.core";
import { ConfigurationChangeTokenSource } from "@rhombus-std/options.augmentations";
import type { AugmentationSet } from "@rhombus-std/primitives";
import { registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";

import { MetricsConfigureOptions } from "./metrics-configure-options";

/** The `MetricsBuilderConfigurationExtensions` augmentation set for {@link IMetricsBuilder} (docs §28). */
export const MetricsBuilderConfigurationExtensions = {
  /**
   * Reads metrics enablement rules from `configuration` and configures which
   * meters, instruments, and listeners are enabled. Mirrors
   * `MetricsBuilderConfigurationExtensions.AddConfiguration`.
   */
  addMetricsConfiguration(builder: IMetricsBuilder, configuration: IConfiguration): IMetricsBuilder {
    builder.services.addValue(METRICS_CONFIGURE_TOKEN, new MetricsConfigureOptions(configuration));
    builder.services.addValue(METRICS_CHANGE_TOKEN_SOURCE_TOKEN, new ConfigurationChangeTokenSource(configuration));
    return builder;
  },
} satisfies AugmentationSet<IMetricsBuilder>;

// Self-registration for the config-binding member of the OPEN `IMetricsBuilder`
// receiver (docs §38). This const lives downstream (its `IConfiguration` dep keeps
// it out of diagnostics.core), so per rule §38.6 its interface-side merge and its
// registerAugmentations call live here beside it -- separate from the
// listener/rule members, which register from diagnostics.core against the same
// token. The concrete `MetricsBuilder` (@augment'd) pulls both bags' members.
//
// The merge targets the DECLARING module (via the internal/* subpath), not the
// package barrel: every interface-side merge for one interface must resolve to
// the same module file, or TS treats the accumulated `this`-returning members
// as having unrelated this-types and the concrete builders stop satisfying
// `implements IMetricsBuilder`.
declare module "@rhombus-std/diagnostics.core/internal/metrics-builder" {
  interface IMetricsBuilder {
    addMetricsConfiguration(configuration: IConfiguration): this;
  }
}

registerAugmentations(nameof<IMetricsBuilder>(), MetricsBuilderConfigurationExtensions);
