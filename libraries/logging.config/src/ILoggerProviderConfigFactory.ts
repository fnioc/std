// The provider type travels as its derived token (`"<declaring-package>:<TypeName>"`,
// e.g. `tokenfor<ConsoleLoggerProvider>()`) rather than a type argument, since
// TS erases generics at runtime.

import type { IConfig } from '@rhombus-std/config.core';
import type { Token } from '@rhombus-std/di.core';

/** Allows access to the configuration section associated with a logger provider. */
export interface ILoggerProviderConfigFactory {
  /**
   * Returns the configuration section associated with the logger provider.
   *
   * @param providerType The logger provider type's token
   * (`tokenfor<TProvider>()`).
   */
  getConfig(providerType: Token): IConfig;
}
