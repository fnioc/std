// `T` is a compile-time phantom -- it only selects which closed di token to
// resolve. The runtime identity is the closed token
// {@link loggerProviderConfigToken} derives; the open template (`...<$1>`)
// is registered by the no-arg `addConfig`, so resolving any closing
// constructs a `LoggerProviderConfig` for that provider.

import type { IConfig } from '@rhombus-std/config.core';
import { closeToken, type Token } from '@rhombus-std/di2.core';

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
  readonly config: IConfig;
}

// The token base — what `tokenfor<ILoggerProviderConfig<…>>()` derives as
// the generic's base for this declaring package. Kept module-local; every
// external use site goes through the closing helper below (or derives the
// closed token inline with `tokenfor`).
const LOGGER_PROVIDER_CONFIGURATION_BASE: Token = '@rhombus-std/logging.config:ILoggerProviderConfig';

/**
 * The closed di token for {@link ILoggerProviderConfig}`<providerType>`
 * — byte-identical to what `tokenfor<ILoggerProviderConfig<TProvider>>()`
 * derives for that provider type. Pass `"$1"` to spell the open
 * registration template.
 */
export function loggerProviderConfigToken(providerType: Token): Token {
  return closeToken(LOGGER_PROVIDER_CONFIGURATION_BASE, providerType);
}
