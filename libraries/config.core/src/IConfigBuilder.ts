// The `IConfigBuilder` interface -- mirrors MECA's
// `IConfigBuilder.cs` one-type-per-file layout (see docs/decisions.md #46).

import type { IConfigRoot } from './IConfigRoot';
import type { IConfigSource } from './IConfigSource';

/** Represents a type used to build application configuration. */
export interface IConfigBuilder {
  /**
   * A shared key/value bag used to pass data between the builder and its
   * registered sources -- e.g. a source reading a builder-wide setting
   * during {@link IConfigSource.build}. One mutable `Map` for the
   * builder's lifetime; mirrors the reference `IConfigBuilder`'s
   * `Properties` dictionary.
   */
  get properties(): Map<string, unknown>;

  /** The sources used to obtain configuration values. */
  get sources(): readonly IConfigSource[];

  /** Adds a new configuration source. Returns the same {@link IConfigBuilder}. */
  add(source: IConfigSource): IConfigBuilder;

  /**
   * Builds an {@link IConfig} with keys and values from the set of
   * sources registered in {@link IConfigBuilder.sources}.
   */
  build(): IConfigRoot;
}
