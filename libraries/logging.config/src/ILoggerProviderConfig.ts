// ILoggerProviderConfig<T>, ported from the reference logging
// configuration project's `ILoggerProviderConfig<T>`.
//
// `T` is the provider type the configuration belongs to — a compile-time
// phantom (exactly as in the reference, where it only selects the closed
// generic to inject). The runtime identity is the closed di token
// {@link loggerProviderConfigToken} derives; the open template
// (`...<$1>`) is registered by the no-arg `addConfiguration`, so resolving any
// closing constructs a `LoggerProviderConfig` for that provider.

import type { IConfig } from '@rhombus-std/config.core';
import { closeToken, type Token } from '@rhombus-std/di.core';

/**
 * Allows access to the configuration section associated with a logger
 * provider.
 *
 * @typeParam T The type of logger provider to get configuration for
 * (compile-time phantom; the runtime counterpart is the token argument of
 * {@link loggerProviderConfigToken}).
 */
export interface ILoggerProviderConfig<T> {
  /** The configuration section for the requested logger provider. */
  readonly configuration: IConfig;
}

// The token base — what `nameof<ILoggerProviderConfig<…>>()` derives as
// the generic's base for this declaring package. Kept module-local; every
// external use site goes through the closing helper below (or derives the
// closed token inline with `nameof`).
const LOGGER_PROVIDER_CONFIGURATION_BASE: Token = '@rhombus-std/logging.config:ILoggerProviderConfig';

/**
 * The closed di token for {@link ILoggerProviderConfig}`<providerType>`
 * — byte-identical to what a transformer consumer's
 * `nameof<ILoggerProviderConfig<TProvider>>()` derives. Pass `"$1"` to
 * spell the open registration template.
 */
export function loggerProviderConfigToken(providerType: Token): Token {
  return closeToken(LOGGER_PROVIDER_CONFIGURATION_BASE, providerType);
}
