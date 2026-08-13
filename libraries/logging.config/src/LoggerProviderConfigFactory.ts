import { ConfigBuilder } from '@rhombus-std/config';
import type { IConfig } from '@rhombus-std/config.core';
import { Type } from '@rhombus-std/primitives';
import type { ILoggerProviderConfigFactory } from './ILoggerProviderConfigFactory';
import type { LoggingConfig } from './LoggingConfig';

/**
 * The provider type's name — the flat section key the lookup uses. A qualified
 * spelling can't serve as one, since `:` is the configuration path delimiter.
 */
function sectionKeyFor(providerType: Type): string {
  return providerType.kind === 'global' || providerType.kind === 'import'
    ? providerType.name
    : Type.stringify(providerType);
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

  public getConfig(providerType: Type | string): IConfig {
    const sectionKey = sectionKeyFor(typeof providerType === 'string' ? Type.from(providerType) : providerType);
    const builder = new ConfigBuilder();
    for (const config of this.#configs) {
      builder.addConfig(config.config.getSection(sectionKey));
    }
    return builder.build();
  }
}
