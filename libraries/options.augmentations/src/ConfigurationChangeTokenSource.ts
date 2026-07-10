// ConfigurationChangeTokenSource -- ported from MEO's
// ConfigurationChangeTokenSource<TOptions>. Wraps an IConfiguration and hands
// back its reload token, so an assembled reactive `Options<T>` re-runs its
// pipeline whenever the configuration reloads (#6).

import type { IConfiguration } from "@rhombus-std/config.core";
import type { IChangeToken } from "@rhombus-std/primitives";

import type { OptionsChangeTokenSource } from "./OptionsChangeTokenSource.js";

/**
 * An {@link OptionsChangeTokenSource} backed by an {@link IConfiguration}:
 * {@link getChangeToken} returns the configuration's reload token, so a change
 * to the configuration (a provider reload) notifies the reactive `Options<T>`
 * watching it. Mirrors MEO's `ConfigurationChangeTokenSource<TOptions>`.
 */
export class ConfigurationChangeTokenSource implements OptionsChangeTokenSource {
  readonly #config: IConfiguration;

  /**
   * @param config The configuration to watch. Its {@link IConfiguration.getReloadToken}
   * feeds every fire.
   */
  public constructor(config: IConfiguration) {
    this.#config = config;
  }

  /** Returns the configuration's reload token. */
  public getChangeToken(): IChangeToken {
    return this.#config.getReloadToken();
  }
}
