// TracingBuilderConfigExtensions -- ported from MED.Tracing's
// `TracingBuilderConfigExtensions.AddConfiguration`. The tracing analog of
// MetricsBuilderConfigExtensions; authored as a named object literal
// (docs §28) and installed onto the concrete builder in ./builder-augmentations.

import type { IConfig } from '@rhombus-std/config';
import { type ITracingBuilder, TRACING_CHANGE_TOKEN_SOURCE_TOKEN, TRACING_CONFIGURATION_TOKEN,
  TRACING_CONFIGURE_TOKEN } from '@rhombus-std/diagnostics.core';
import { ConfigChangeTokenSource } from '@rhombus-std/options.augmentations';
import { type AugmentationSet, registerAugmentations } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';

import { TracingConfig } from './TracingConfig';
import { TracingConfigureOptions } from './TracingConfigureOptions';

/** The `TracingBuilderConfigExtensions` augmentation set for {@link ITracingBuilder} (docs §28). */
export const TracingBuilderConfigExtensions = {
  /**
   * Reads tracing enablement rules from `config` and configures which
   * activity sources and activities are enabled. Mirrors
   * `TracingBuilderConfigExtensions.AddConfiguration`.
   */
  addTracingConfig(builder: ITracingBuilder, config: IConfig): ITracingBuilder {
    builder.services.addValue(TRACING_CONFIGURE_TOKEN, new TracingConfigureOptions(config));
    builder.services.addValue(TRACING_CHANGE_TOKEN_SOURCE_TOKEN, new ConfigChangeTokenSource(config));
    builder.services.addValue(TRACING_CONFIGURATION_TOKEN, new TracingConfig(config));
    return builder;
  },
} satisfies AugmentationSet<ITracingBuilder>;

// Self-registration for the config-binding member of the OPEN `ITracingBuilder`
// receiver (docs §38). Lives downstream (its `IConfig` dep keeps it out of
// diagnostics.core), so per rule §38.6 its interface-side merge and its
// registerAugmentations call live here beside it -- separate from the
// listener/rule members registering from diagnostics.core against the same token.
//
// The merge targets the package BARREL (`@rhombus-std/diagnostics.core`),
// matching diagnostics.core's own listener/rule merge. A cross-package merge is
// kept verbatim in the rolled `.d.ts` (rollup-dts `respectExternal`), so it only
// reaches a published consumer if the specifier survives publish -- the
// `internal/*` subpath this used to target is scrubbed at publish (docs §7), so
// consumers of `@rhombus-std/diagnostics` silently lost `addTracingConfig`.
// The barrel is publish-resolvable and, shared with diagnostics.core's merge,
// keeps every site for this interface on one module file (the §38 merge-identity
// rule), so the concrete builders still satisfy `implements ITracingBuilder`.
declare module '@rhombus-std/diagnostics.core' {
  interface ITracingBuilder {
    addTracingConfig(config: IConfig): this;
  }
}

registerAugmentations(nameof<ITracingBuilder>(), TracingBuilderConfigExtensions);
