// The `IConfigurationRoot` interface -- mirrors MECA's
// `IConfigurationRoot.cs` one-type-per-file layout (see docs/decisions.md #46).

import type { IConfiguration } from "./configuration";
import type { IConfigurationProvider } from "./configuration-provider";

/** Represents the root of an {@link IConfiguration} hierarchy. */
export interface IConfigurationRoot extends IConfiguration {
  /**
   * Forces the configuration values to be reloaded from the underlying
   * {@link IConfigurationProvider} providers.
   */
  reload(): void;

  /** The {@link IConfigurationProvider} providers for this configuration. */
  get providers(): Iterable<IConfigurationProvider>;
}
