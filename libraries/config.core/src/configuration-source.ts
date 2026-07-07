// The `IConfigurationSource` interface -- mirrors MECA's
// `IConfigurationSource.cs` one-type-per-file layout (see docs/decisions.md #46).

import type { IConfigurationBuilder } from "./configuration-builder";
import type { IConfigurationProvider } from "./configuration-provider";

/** Represents a source of configuration key/values for an application. */
export interface IConfigurationSource {
  /** Builds the {@link IConfigurationProvider} for this source. */
  build(builder: IConfigurationBuilder): IConfigurationProvider;
}
