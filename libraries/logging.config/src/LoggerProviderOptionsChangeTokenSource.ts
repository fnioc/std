import { ConfigChangeTokenSource } from '@rhombus-std/options.augmentations';
import type { ILoggerProviderConfig } from './ILoggerProviderConfig';

/**
 * A change-token source wired to provider `TProvider`'s configuration section,
 * so an `IOptions<TOptions>` bound to it re-binds when the section reloads —
 * registered per options type by
 * `LoggerProviderOptions.getProviderOptionsManifest`.
 *
 * @typeParam TOptions Compile-time only; the base class doesn't use it.
 */
export class LoggerProviderOptionsChangeTokenSource<TOptions, TProvider> extends ConfigChangeTokenSource {
  public constructor(providerConfig: ILoggerProviderConfig<TProvider>) {
    super(providerConfig.config);
  }
}
