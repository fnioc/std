// LoggerProviderConfiguration<T>, ported from the reference logging
// configuration project's internal `LoggerProviderConfiguration<T>`.
//
// The reference constructor reifies the provider type with `typeof(T)`; this
// platform erases `T`, so the constructor takes the provider token as a
// `Typeof<T>`-branded parameter — the di engine supplies it from the open
// registration's `typeArg(1)` slot (see the no-arg `addConfiguration`), and a
// direct construction passes `nameof<TProvider>()`.

import type { IConfiguration } from "@rhombus-std/config.core";
import type { Typeof } from "@rhombus-std/di.core";
import type { ILoggerProviderConfiguration } from "./ILoggerProviderConfiguration";
import type { ILoggerProviderConfigurationFactory } from "./ILoggerProviderConfigurationFactory";

/**
 * The concrete {@link ILoggerProviderConfiguration}: asks the
 * {@link ILoggerProviderConfigurationFactory} for the section associated with
 * the provider type `T` at construction.
 */
export class LoggerProviderConfiguration<T> implements ILoggerProviderConfiguration<T> {
  public readonly configuration: IConfiguration;

  public constructor(
    providerConfigurationFactory: ILoggerProviderConfigurationFactory,
    providerType: Typeof<T>,
  ) {
    this.configuration = providerConfigurationFactory.getConfiguration(providerType);
  }
}
