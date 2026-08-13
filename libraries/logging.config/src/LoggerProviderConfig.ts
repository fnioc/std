// `T` erases at runtime, so the constructor receives the provider type as a
// witness -- the engine supplies it from the open registration's placeholder
// slot (see the no-arg `addConfig`), and a direct construction passes
// `typefor<TProvider>()`.

import type { IConfig } from '@rhombus-std/config.core';
import type { Typeof } from '@rhombus-std/di.core';
import type { ILoggerProviderConfig } from './ILoggerProviderConfig';
import type { ILoggerProviderConfigFactory } from './ILoggerProviderConfigFactory';

/**
 * The concrete {@link ILoggerProviderConfig}: asks the
 * {@link ILoggerProviderConfigFactory} for the section associated with
 * the provider type `T` at construction.
 */
export class LoggerProviderConfig<T> implements ILoggerProviderConfig<T> {
  public readonly config: IConfig;

  public constructor(providerConfigFactory: ILoggerProviderConfigFactory, providerType: Typeof<T>) {
    this.config = providerConfigFactory.getConfig(providerType);
  }
}
