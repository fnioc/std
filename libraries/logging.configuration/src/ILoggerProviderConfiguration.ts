// ILoggerProviderConfiguration<T>, ported from the reference logging
// configuration project's `ILoggerProviderConfiguration<T>`.
//
// `T` is the provider type the configuration belongs to — a compile-time
// phantom (exactly as in the reference, where it only selects the closed
// generic to inject). The runtime identity is the closed di token
// {@link loggerProviderConfigurationToken} derives; the open template
// (`...<$1>`) is registered by the no-arg `addConfiguration`, so resolving any
// closing constructs a `LoggerProviderConfiguration` for that provider.

import type { IConfiguration } from "@rhombus-std/config.core";
import { closeToken, type Token } from "@rhombus-std/di.core";

/**
 * Allows access to the configuration section associated with a logger
 * provider.
 *
 * @typeParam T The type of logger provider to get configuration for
 * (compile-time phantom; the runtime counterpart is the token argument of
 * {@link loggerProviderConfigurationToken}).
 */
export interface ILoggerProviderConfiguration<T> {
  /** The configuration section for the requested logger provider. */
  readonly configuration: IConfiguration;
}

// The token base — what `nameof<ILoggerProviderConfiguration<…>>()` derives as
// the generic's base for this declaring package. Kept module-local; every
// external use site goes through the closing helper below (or derives the
// closed token inline with `nameof`).
const LOGGER_PROVIDER_CONFIGURATION_BASE: Token = "@rhombus-std/logging.configuration:ILoggerProviderConfiguration";

/**
 * The closed di token for {@link ILoggerProviderConfiguration}`<providerType>`
 * — byte-identical to what a transformer consumer's
 * `nameof<ILoggerProviderConfiguration<TProvider>>()` derives. Pass `"$1"` to
 * spell the open registration template.
 */
export function loggerProviderConfigurationToken(providerType: Token): Token {
  return closeToken(LOGGER_PROVIDER_CONFIGURATION_BASE, providerType);
}
