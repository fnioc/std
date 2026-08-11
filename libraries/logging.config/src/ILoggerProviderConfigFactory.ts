import type { IConfig } from '@rhombus-std/config.core';
import type { Type } from '@rhombus-std/primitives';

/** Allows access to the configuration section associated with a logger provider. */
export interface ILoggerProviderConfigFactory {
  /**
   * Returns the configuration section associated with the logger provider.
   *
   * @param providerType The logger provider type. A type token naming it is
   * read into one.
   */
  getConfig(providerType: Type | string): IConfig;
}
