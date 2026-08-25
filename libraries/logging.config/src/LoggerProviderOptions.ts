// Exported as a plain object rather than an ILoggingBuilder augmentation set
// -- no registry install, no `declare module` merge. The call surface is
// `LoggerProviderOptions.getProviderOptionsManifest(…)`.
//
// The returned manifest registers a CLASS at the options type's pipeline
// slots (`configureStepType`/`changeTokenSourceType`), with the closed
// `ILoggerProviderConfig<TProvider>` type as its dep slot -- resolved through
// the open template the no-arg `addConfig` registers, so the whole chain stays
// lazy: nothing touches configuration until the `IOptions<TOptions>` assembly
// materializes.
//
// `TOptions`/`TProvider` reify as runtime types (`optionsType`,
// `providerType`), since type arguments erase here.

import { Manifest } from '@rhombus-std/di.core';
import { changeTokenSourceType, configureStepType } from '@rhombus-std/options.augmentations';
import { Type } from '@rhombus-std/primitives';
import { loggerProviderConfigType } from './ILoggerProviderConfig';
import { LoggerProviderConfigureOptions } from './LoggerProviderConfigureOptions';
import { LoggerProviderOptionsChangeTokenSource } from './LoggerProviderOptionsChangeTokenSource';

/** Helpers to initialize options objects from logger provider configuration. */
export const LoggerProviderOptions = {
  /**
   * The registrations that load settings for the provider `TProvider` into
   * the `TOptions` type: a provider-bound configure step and change-token
   * source for `optionsType`'s pipeline slots, on the narrowest lifetime
   * vocabulary they use. A consumer merges this in
   * (`services.addMany(LoggerProviderOptions.getProviderOptionsManifest(…))`).
   * Requires the provider-configuration services (the no-arg `addConfig`) and
   * a prior `addOptions(optionsType, …)` for the type.
   *
   * @param optionsType The BARE `TOptions` type the steps attach to — the same
   * type the `addOptions`/`configure` pipeline uses.
   * @param providerType The provider type.
   */
  getProviderOptionsManifest<TOptions, TProvider>(optionsType: Type, providerType: Type): Manifest<'singleton'> {
    const providerConfig = loggerProviderConfigType(providerType);
    return Manifest.empty<'singleton'>()
      .add(configureStepType(optionsType), LoggerProviderConfigureOptions, Type.ctor(configureStepType(optionsType), [[providerConfig]]), 'singleton')
      .add(changeTokenSourceType(optionsType), LoggerProviderOptionsChangeTokenSource, Type.ctor(changeTokenSourceType(optionsType), [[providerConfig]]), 'singleton');
  },
};
