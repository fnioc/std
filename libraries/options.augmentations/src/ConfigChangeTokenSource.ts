// ConfigChangeTokenSource -- ported from MEO's
// ConfigChangeTokenSource<TOptions>. Wraps an IConfig and hands
// back its reload token, so an assembled reactive `IOptions<T>` re-runs its
// pipeline whenever the configuration reloads (#6).

import type { IConfig } from '@rhombus-std/config.core';
import type { IChangeToken } from '@rhombus-std/primitives';

import type { IOptionsChangeTokenSource } from './IOptionsChangeTokenSource.js';

/**
 * An {@link IOptionsChangeTokenSource} backed by an {@link IConfig}:
 * {@link getChangeToken} returns the configuration's reload token, so a change
 * to the configuration (a provider reload) notifies the reactive `IOptions<T>`
 * watching it. Mirrors MEO's `ConfigChangeTokenSource<TOptions>`.
 */
export class ConfigChangeTokenSource implements IOptionsChangeTokenSource {
  readonly #config: IConfig;

  /**
   * @param config The configuration to watch. Its {@link IConfig.getReloadToken}
   * feeds every fire.
   */
  public constructor(config: IConfig) {
    this.#config = config;
  }

  /** Returns the configuration's reload token. */
  public getChangeToken(): IChangeToken {
    return this.#config.getReloadToken();
  }
}
