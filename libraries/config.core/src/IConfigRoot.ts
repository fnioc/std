// The `IConfigRoot` interface -- mirrors MECA's
// `IConfigRoot.cs` one-type-per-file layout (see docs/decisions.md #46).

import type { IConfig } from './IConfig';
import type { IConfigProvider } from './IConfigProvider';

/** Represents the root of an {@link IConfig} hierarchy. */
export interface IConfigRoot extends IConfig {
  /**
   * Forces the configuration values to be reloaded from the underlying
   * {@link IConfigProvider} providers.
   */
  reload(): void;

  /** The {@link IConfigProvider} providers for this configuration. */
  get providers(): Iterable<IConfigProvider>;
}
