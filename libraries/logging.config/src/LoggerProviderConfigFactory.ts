// LoggerProviderConfigFactory, ported from the reference logging
// configuration project's internal `LoggerProviderConfigFactory`.
//
// The reference chains, for every registered `LoggingConfig`, the
// section named by the provider type's FULL NAME and the section named by its
// alias (a provider-class attribute) into one built configuration. Two
// platform adaptations:
//
//   - Full name → the token's TypeName component. The type-identity string
//     here is the derived token `"<declaring-package>:<TypeName>"`, and `:` is
//     the configuration PATH DELIMITER — the full token can never be a flat
//     section key — so the lookup keys on the TypeName part
//     (`"@rhombus-std/logging.console:ConsoleLoggerProvider"` →
//     `"ConsoleLoggerProvider"`).
//   - Alias lookup is NOT ported: the reference reads it off a provider-class
//     attribute declared in the abstractions package
//     (`ProviderAliasAttribute`), which @rhombus-std/logging.core does not
//     have yet. Once it exists, a second chained `getSection(alias)` per
//     configuration restores parity.

import { ConfigBuilder } from '@rhombus-std/config';
import type { IConfig } from '@rhombus-std/config.core';
import type { Token } from '@rhombus-std/di.core';
import type { ILoggerProviderConfigFactory } from './ILoggerProviderConfigFactory';
import type { LoggingConfig } from './LoggingConfig';

/** The token's TypeName component — the flat section key the lookup uses. */
function sectionKeyFor(providerType: Token): string {
  return providerType.slice(providerType.indexOf(':') + 1);
}

/**
 * The concrete {@link ILoggerProviderConfigFactory}: chains the
 * provider-named section of every registered {@link LoggingConfig}
 * (in registration order, so later configurations win on key conflicts) into
 * one live configuration.
 */
export class LoggerProviderConfigFactory implements ILoggerProviderConfigFactory {
  readonly #configs: readonly LoggingConfig[];

  /**
   * @param configs Every {@link LoggingConfig} registered by
   * `addConfig` (injected as the di collection of that token).
   */
  public constructor(configs: readonly LoggingConfig[]) {
    this.#configs = configs;
  }

  public getConfig(providerType: Token): IConfig {
    const sectionKey = sectionKeyFor(providerType);
    const builder = new ConfigBuilder();
    for (const config of this.#configs) {
      builder.addConfig(config.config.getSection(sectionKey));
    }
    return builder.build();
  }
}
