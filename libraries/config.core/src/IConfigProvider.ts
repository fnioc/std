import type { IChangeToken } from '@rhombus-std/primitives';
import type { ITryGetResult } from './types';

/** Provides configuration key/values for an application. */
export interface IConfigProvider {
  /** Looks up `key`; a miss returns `[false]` rather than throwing. */
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
   * The immediate descendant keys for `parentPath`, given the keys the
   * preceding providers already returned for that same path.
   */
  getChildKeys(earlierKeys: Iterable<string>, parentPath?: string): Iterable<string>;
}
