// The `IConfiguration` interface -- mirrors MECA's `IConfiguration.cs`
// one-type-per-file layout (see docs/decisions.md #46).

import type { IChangeToken } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import type { IConfigurationSection } from './IConfigurationSection';
import type { ConfigObject } from './types';

/**
 * A set of key/value application configuration properties. Every value is a
 * raw string unless explicitly coerced; navigation always yields a Section and
 * leaf reads always yield the requested scalar type (no accessor returns a
 * string for one input and a section for another).
 */
export interface IConfiguration {
  /** This node's own value (undefined on the root, or when absent). */
  readonly value: string | undefined;

  /** The raw string at a flat colon-delimited path (undefined if absent). */
  get(path: string): string | undefined;

  /** A typed leaf via a caller-supplied factory (undefined if the path is absent). */
  get<T>(path: string, factory: Func<[string], T>): T | undefined;

  /**
   * Coerces a leaf to a finite number. Returns `dflt` (or undefined) when the
   * path is absent; THROWS when the path is present but not a finite number.
   */
  getNum(path: string): number | undefined;
  getNum(path: string, dflt: number): number;

  /**
   * Coerces a leaf to a boolean, LIBERAL and case-insensitive (true/1/yes/on
   * -> true, false/0/no/off -> false). Returns `dflt` (or undefined) when
   * absent; THROWS when present but unrecognized.
   */
  getBool(path: string): boolean | undefined;
  getBool(path: string, dflt: boolean): boolean;

  /** Writes a descendant key (index-based writes are not supported). */
  set(key: string, value: string): this;

  /**
   * A sub-section with the specified key. Never returns `null`: a missing key
   * yields an empty {@link IConfigurationSection}.
   */
  getSection(key: string): IConfigurationSection;

  /** The immediate descendant configuration sub-sections. */
  getChildren(): Iterable<IConfigurationSection>;

  /** This node's subtree as a nested plain string object. */
  toObject(): ConfigObject;

  /**
   * A token that fires when this configuration is reloaded -- the root
   * composes its providers' tokens into its own; a section delegates to its
   * root.
   */
  getReloadToken(): IChangeToken;
}
