// LoggerProviderConfigureOptions<TOptions, TProvider>, ported from the
// reference logging configuration project's internal
// `LoggerProviderConfigureOptions<TOptions, TProvider>`.
//
// The reference derives from `ConfigureFromConfigurationOptions<TOptions>`
// (the reflective config→options bind); the analog here is
// @rhombus-std/options.augmentations' `ConfigConfigureOptions<TOptions>`
// (the structural deep-merge bind), seeded with the provider's configuration
// section.

import { ConfigConfigureOptions } from '@rhombus-std/options.augmentations';
import type { ILoggerProviderConfig } from './ILoggerProviderConfig';

/**
 * A configure step that loads the settings of provider `TProvider` into a
 * `TOptions` value — registered per options token by
 * `LoggerProviderOptions.registerProviderOptions`.
 */
export class LoggerProviderConfigureOptions<TOptions, TProvider> extends ConfigConfigureOptions<TOptions> {
  public constructor(providerConfiguration: ILoggerProviderConfig<TProvider>) {
    super(providerConfiguration.configuration);
  }
}
