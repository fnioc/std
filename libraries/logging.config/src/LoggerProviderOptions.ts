// Exported as a plain object rather than an ILoggingBuilder augmentation set
// -- no registry install, no `declare module` merge. The call surface is
// `LoggerProviderOptions.registerProviderOptions(services, …)`.
//
// `registerProviderOptions` registers a CLASS at the options token's derived
// pipeline slots (`configureStepToken`/`changeTokenSourceToken`), with the
// closed `ILoggerProviderConfig<TProvider>` token as its dep slot -- resolved
// through the open template the no-arg `addConfig` registers, so the whole
// chain stays lazy: nothing touches configuration until the
// `IOptions<TOptions>` assembly materializes.
//
// `TOptions`/`TProvider` reify as runtime tokens (`optionsToken`,
// `providerType`), since type arguments erase here. Calling this twice for
// the same (options, provider) pair appends the pipeline step twice --
// an idempotent re-bind, but not deduped.

import type { Manifest } from '@rhombus-std/di2.core';
import type { IOptions } from '@rhombus-std/options';
import { changeTokenSourceToken, configureStepToken } from '@rhombus-std/options.augmentations';
import { loggerProviderConfigToken } from './ILoggerProviderConfig';
import { LoggerProviderConfigureOptions } from './LoggerProviderConfigureOptions';
import { LoggerProviderOptionsChangeTokenSource } from './LoggerProviderOptionsChangeTokenSource';

/** Helpers to initialize options objects from logger provider configuration. */
export const LoggerProviderOptions = {
  /**
   * Indicates that settings for the provider `TProvider` should be loaded
   * into the `TOptions` type: appends a provider-bound configure step and
   * change-token source to `optionsToken`'s pipeline slots. Requires the
   * provider-configuration services (the no-arg `addConfig`) and an
   * `addOptions(optionsToken, …)` assembly registration for the token.
   *
   * @param services The registration builder to register on.
   * @param optionsToken The `IOptions<TOptions>` token the steps attach to —
   * the same token the `addOptions`/`configure` pipeline uses.
   * @param providerType The provider type's token (`tokenfor<TProvider>()`).
   * @returns The manifest carrying both registrations. The chain is immutable,
   * so the caller MUST keep it (`services = LoggerProviderOptions
   * .registerProviderOptions(services, …)`) — the `services` passed in is
   * unchanged.
   */
  registerProviderOptions<TOptions, TProvider>(services: Manifest, optionsToken: string,
    providerType: string): Manifest {
    const providerConfig: string = loggerProviderConfigToken(providerType);
    return services.addClass(configureStepToken(optionsToken), LoggerProviderConfigureOptions, [[providerConfig]],
      'singleton').addClass(changeTokenSourceToken(optionsToken), LoggerProviderOptionsChangeTokenSource, [[
        providerConfig,
      ]], 'singleton');
  },
};
