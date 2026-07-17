// LoggerProviderOptionsChangeTokenSource<TOptions, TProvider>, ported from the
// reference logging configuration project's
// `LoggerProviderOptionsChangeTokenSource<TOptions, TProvider>`.
//
// `TOptions` is a compile-time phantom here: the base
// `ConfigChangeTokenSource` dropped its options type parameter in the
// port (a source is tied to the one options registration it was added for —
// docs/decisions.md §4.2), so the parameter survives only to mirror the
// reference signature.

import { ConfigChangeTokenSource } from '@rhombus-std/options.augmentations';
import type { ILoggerProviderConfig } from './ILoggerProviderConfig';

/**
 * A change-token source wired to provider `TProvider`'s configuration section,
 * so an `IOptions<TOptions>` bound to it re-binds when the section reloads —
 * registered per options token by
 * `LoggerProviderOptions.registerProviderOptions`.
 */
export class LoggerProviderOptionsChangeTokenSource<TOptions, TProvider> extends ConfigChangeTokenSource {
  public constructor(providerConfig: ILoggerProviderConfig<TProvider>) {
    super(providerConfig.config);
  }
}
