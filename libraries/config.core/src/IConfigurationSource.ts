// The `IConfigurationSource` interface -- mirrors MECA's
// `IConfigurationSource.cs` one-type-per-file layout (see docs/decisions.md #46).

import type { IConfigurationBuilder } from './IConfigurationBuilder';
import type { IConfigurationProvider } from './IConfigurationProvider';

/** Represents a source of configuration key/values for an application. */
export interface IConfigurationSource {
  /** Builds the {@link IConfigurationProvider} for this source. */
  build(builder: IConfigurationBuilder): IConfigurationProvider;
}
