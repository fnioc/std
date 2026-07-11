// The `IConfigurationProvider` interface -- mirrors MECA's
// `IConfigurationProvider.cs` one-type-per-file layout (see docs/decisions.md #46).

import type { IChangeToken } from '@rhombus-std/primitives';
import type { ITryGetResult } from './types';

/** Provides configuration key/values for an application. */
export interface IConfigurationProvider {
  /** Tries to get a configuration value for the specified key. */
  tryGet(key: string): ITryGetResult<string>;

  /** Sets a configuration value for the specified key. */
  set(key: string, value?: string): void;

  /**
   * Attempts to get an {@link IChangeToken} for change tracking. Returns a
   * token if this provider supports change tracking.
   */
  getReloadToken(): IChangeToken;

  /** Loads configuration values from the source represented by this provider. */
  load(): void;

  /**
   * Returns the immediate descendant configuration keys for a given parent
   * path based on the data of this provider and the set of keys returned by
   * all the preceding providers.
   *
   * @param earlierKeys The child keys returned by the preceding providers for the same parent path.
   * @param parentPath The parent path.
   */
  getChildKeys(earlierKeys: Iterable<string>, parentPath?: string): Iterable<string>;
}
