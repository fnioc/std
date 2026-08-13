// Exported as a plain object rather than an ILoggingBuilder augmentation set
// -- no registry install, no `declare module` merge. The call surface is
// `LoggerProviderOptions.registerProviderOptions(services, …)`.
//
// `registerProviderOptions` registers a CLASS at the options token's derived
// pipeline slots (`configureStepType`/`changeTokenSourceType`), with the
// closed `ILoggerProviderConfig<TProvider>` token as its dep slot -- resolved
// through the open template the no-arg `addConfig` registers, so the whole
// chain stays lazy: nothing touches configuration until the
// `IOptions<TOptions>` assembly materializes.
//
// `TOptions`/`TProvider` reify as runtime types (`optionsType`,
// `providerType`), since type arguments erase here. Calling this twice for
// the same (options, provider) pair appends the pipeline step twice --
// an idempotent re-bind, but not deduped.

import type { Manifest } from '@rhombus-std/di.core';
import { changeTokenSourceType, configureStepType } from '@rhombus-std/options.augmentations';
import { Type } from '@rhombus-std/primitives';
import { loggerProviderConfigType } from './ILoggerProviderConfig';
import { LoggerProviderConfigureOptions } from './LoggerProviderConfigureOptions';
import { LoggerProviderOptionsChangeTokenSource } from './LoggerProviderOptionsChangeTokenSource';

/** Helpers to initialize options objects from logger provider configuration. */
export const LoggerProviderOptions = {
  /**
   * Indicates that settings for the provider `TProvider` should be loaded
   * into the `TOptions` type: appends a provider-bound configure step and
   * change-token source to `optionsType`'s pipeline slots. Requires the
   * provider-configuration services (the no-arg `addConfig`) and a prior
   * `addOptions(optionsType, …)` for the type.
   *
   * @param services The registration builder to register on.
   * @param optionsType The BARE `TOptions` type the steps attach to — the same
   * type the `addOptions`/`configure` pipeline uses.
   * @param providerType The provider type. A type token naming it is read
   * into one.
   * @returns The manifest carrying both registrations. The chain is immutable,
   * so the caller MUST keep it (`services = LoggerProviderOptions
   * .registerProviderOptions(services, …)`) — the `services` passed in is
   * unchanged.
   */
  registerProviderOptions<TOptions, TProvider>(services: Manifest, optionsType: Type | string,
    providerType: Type | string): Manifest {
    const options = typeof optionsType === 'string' ? Type.from(optionsType) : optionsType;
    const providerConfig = loggerProviderConfigType(
      typeof providerType === 'string' ? Type.from(providerType) : providerType,
    );
    return services.addClass(configureStepType(options), LoggerProviderConfigureOptions,
      Type.ctor(configureStepType(options), providerConfig), 'singleton')
      .addClass(changeTokenSourceType(options), LoggerProviderOptionsChangeTokenSource,
        Type.ctor(changeTokenSourceType(options), providerConfig), 'singleton');
  },
};
