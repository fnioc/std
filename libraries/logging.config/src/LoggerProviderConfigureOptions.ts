import { ConfigConfigureOptions } from '@rhombus-std/options.augmentations';
import type { ILoggerProviderConfig } from './ILoggerProviderConfig';

/**
 * A configure step that loads the settings of provider `TProvider` into a
 * `TOptions` value — registered per options token by
 * `LoggerProviderOptions.registerProviderOptions`.
 */
export class LoggerProviderConfigureOptions<TOptions, TProvider> extends ConfigConfigureOptions<TOptions> {
  public constructor(providerConfig: ILoggerProviderConfig<TProvider>) {
    super(providerConfig.config);
  }
}
