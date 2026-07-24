import { ConfigBuilder } from '@rhombus-std/config';
import type { IConfig } from '@rhombus-std/config.core';
import type { Token } from '@rhombus-std/di.core';
import type { ILoggerProviderConfigFactory } from './ILoggerProviderConfigFactory';
import type { LoggingConfig } from './LoggingConfig';

/**
 * The token's TypeName component — the flat section key the lookup uses.
 * The full token can't serve as a section key directly since `:` is the
 * configuration path delimiter.
 */
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
