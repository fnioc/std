// LoggerProviderOptions, ported from the reference logging configuration
// project's `LoggerProviderOptions` static class (declared in its
// `LoggerProviderConfigurationExtensions.cs`).
//
// Deliberately NOT an extension of the registration builder — the reference
// keeps `RegisterProviderOptions` a plain static helper precisely to stay off
// the `IServiceCollection` surface, so this const is exported WITHOUT a
// registry install or `declare module` merge: the call surface is
// `LoggerProviderOptions.registerProviderOptions(services, …)`, exactly
// mirroring the reference call shape.
//
// The reference registers `IConfigureOptions<TOptions>` /
// `IOptionsChangeTokenSource<TOptions>` service descriptors whose
// constructors inject `ILoggerProviderConfig<TProvider>`; the analog
// here is a CLASS registration at the options token's derived pipeline slots
// (the open service contract @rhombus-std/options.augmentations exports as
// `configureStepToken`/`changeTokenSourceToken`), with the closed
// `ILoggerProviderConfig<TProvider>` token as the dep slot — resolved
// through the open template the no-arg `addConfig` registers, so the
// whole chain stays lazy: nothing touches configuration until the
// `IOptions<TOptions>` assembly materializes.
//
// Divergences from the reference, both platform-forced:
//   - `<TOptions, TProvider>` reify as runtime tokens (`optionsToken`,
//     `providerType`) — type arguments erase here. A transformer consumer
//     derives them inline (`nameof<IOptions<MyOptions>>()`,
//     `nameof<MyProvider>()`); a hand-written one passes the literal strings.
//   - The reference's `TryAddEnumerable` dedupes repeat registrations by
//     implementation type; di.core registrations are append-only, so calling
//     this twice for one (options, provider) pair appends the step twice
//     (an idempotent re-bind — harmless, but not deduped).

import type { IServiceManifest, Token, Typeof } from '@rhombus-std/di.core';
import type { IOptions } from '@rhombus-std/options';
import { changeTokenSourceToken, configureStepToken } from '@rhombus-std/options.augmentations';
import { loggerProviderConfigToken } from './ILoggerProviderConfig';
import { LoggerProviderConfigureOptions } from './LoggerProviderConfigureOptions';
import { LoggerProviderOptionsChangeTokenSource } from './LoggerProviderOptionsChangeTokenSource';

/**
 * Helpers to initialize options objects from logger provider configuration —
 * the `LoggerProviderOptions` static-class mirror.
 */
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
   * @param providerType The provider type's token (`nameof<TProvider>()`).
   */
  registerProviderOptions<TOptions, TProvider>(
    services: IServiceManifest,
    optionsToken: Typeof<IOptions<TOptions>>,
    providerType: Typeof<TProvider>,
  ): void {
    const providerConfig: Token = loggerProviderConfigToken(providerType);
    services
      .add(configureStepToken(optionsToken), LoggerProviderConfigureOptions, [[providerConfig]])
      .as('singleton');
    services
      .add(changeTokenSourceToken(optionsToken), LoggerProviderOptionsChangeTokenSource, [[providerConfig]])
      .as('singleton');
  },
};
