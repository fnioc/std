// The `IConfigSource` interface -- mirrors MECA's
// `IConfigSource.cs` one-type-per-file layout (see docs/decisions.md #46).

import type { IConfigBuilder } from './IConfigBuilder';
import type { IConfigProvider } from './IConfigProvider';

/** Represents a source of configuration key/values for an application. */
export interface IConfigSource {
  /** Builds the {@link IConfigProvider} for this source. */
  build(builder: IConfigBuilder): IConfigProvider;
}
