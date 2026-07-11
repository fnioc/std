// LoggerProviderConfigurationFactory, ported from the reference logging
// configuration project's internal `LoggerProviderConfigurationFactory`.
//
// The reference chains, for every registered `LoggingConfiguration`, the
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

import { ConfigurationBuilder } from '@rhombus-std/config';
import type { IConfiguration } from '@rhombus-std/config.core';
import type { Token } from '@rhombus-std/di.core';
import type { ILoggerProviderConfigurationFactory } from './ILoggerProviderConfigurationFactory';
import type { LoggingConfiguration } from './LoggingConfiguration';

/** The token's TypeName component — the flat section key the lookup uses. */
function sectionKeyFor(providerType: Token): string {
  return providerType.slice(providerType.indexOf(':') + 1);
}

/**
 * The concrete {@link ILoggerProviderConfigurationFactory}: chains the
 * provider-named section of every registered {@link LoggingConfiguration}
 * (in registration order, so later configurations win on key conflicts) into
 * one live configuration.
 */
export class LoggerProviderConfigurationFactory implements ILoggerProviderConfigurationFactory {
  readonly #configurations: readonly LoggingConfiguration[];

  /**
   * @param configurations Every {@link LoggingConfiguration} registered by
   * `addConfiguration` (injected as the di collection of that token).
   */
  public constructor(configurations: readonly LoggingConfiguration[]) {
    this.#configurations = configurations;
  }

  public getConfiguration(providerType: Token): IConfiguration {
    const sectionKey = sectionKeyFor(providerType);
    const builder = new ConfigurationBuilder();
    for (const configuration of this.#configurations) {
      builder.addConfiguration(configuration.configuration.getSection(sectionKey));
    }
    return builder.build();
  }
}
