// `T` erases at runtime, so the constructor takes the provider token as a
// `string`-branded parameter -- the di engine supplies it from the open
// registration's `typeArg(1)` slot (see the no-arg `addConfig`), and a
// direct construction passes `tokenfor<TProvider>()`.

import type { IConfig } from '@rhombus-std/config.core';
import type { ILoggerProviderConfig } from './ILoggerProviderConfig';
import type { ILoggerProviderConfigFactory } from './ILoggerProviderConfigFactory';

/**
 * The concrete {@link ILoggerProviderConfig}: asks the
 * {@link ILoggerProviderConfigFactory} for the section associated with
 * the provider type `T` at construction.
 */
export class LoggerProviderConfig<T> implements ILoggerProviderConfig<T> {
  public readonly config: IConfig;

  public constructor(providerConfigFactory: ILoggerProviderConfigFactory, providerType: string) {
    this.config = providerConfigFactory.getConfig(providerType);
  }
}
