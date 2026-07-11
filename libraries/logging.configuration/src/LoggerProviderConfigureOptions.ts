// LoggerProviderConfigureOptions<TOptions, TProvider>, ported from the
// reference logging configuration project's internal
// `LoggerProviderConfigureOptions<TOptions, TProvider>`.
//
// The reference derives from `ConfigureFromConfigurationOptions<TOptions>`
// (the reflective config→options bind); the analog here is
// @rhombus-std/options.augmentations' `ConfigurationConfigureOptions<TOptions>`
// (the structural deep-merge bind), seeded with the provider's configuration
// section.

import { ConfigurationConfigureOptions } from "@rhombus-std/options.augmentations";
import type { ILoggerProviderConfiguration } from "./ILoggerProviderConfiguration";

/**
 * A configure step that loads the settings of provider `TProvider` into a
 * `TOptions` value — registered per options token by
 * `LoggerProviderOptions.registerProviderOptions`.
 */
export class LoggerProviderConfigureOptions<TOptions, TProvider> extends ConfigurationConfigureOptions<TOptions> {
  public constructor(providerConfiguration: ILoggerProviderConfiguration<TProvider>) {
    super(providerConfiguration.configuration);
  }
}
