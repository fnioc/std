// ILoggerProviderConfigurationFactory, ported from the reference logging
// configuration project's `ILoggerProviderConfigurationFactory`.
//
// The reference member takes a `Type providerType`; this platform erases types
// at runtime, so the provider type travels as its derived TOKEN
// (`"<declaring-package>:<TypeName>"` — `nameof<ConsoleLoggerProvider>()` for a
// transformer consumer, the literal string for a hand-written one). That is
// the same `typeof(T)` analog the rest of the repo uses (di.core's `Typeof<T>`
// brand / `typeArg(n)` slot).

import type { IConfiguration } from '@rhombus-std/config.core';
import type { Token } from '@rhombus-std/di.core';

/** Allows access to the configuration section associated with a logger provider. */
export interface ILoggerProviderConfigurationFactory {
  /**
   * Returns the configuration section associated with the logger provider.
   *
   * @param providerType The logger provider type's token
   * (`nameof<TProvider>()`).
   */
  getConfiguration(providerType: Token): IConfiguration;
}
