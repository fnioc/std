// The `IConfigurationBuilder` interface -- mirrors MECA's
// `IConfigurationBuilder.cs` one-type-per-file layout (see docs/decisions.md #46).

import type { IConfigurationRoot } from "./IConfigurationRoot";
import type { IConfigurationSource } from "./IConfigurationSource";

/** Represents a type used to build application configuration. */
export interface IConfigurationBuilder {
  /**
   * A shared key/value bag used to pass data between the builder and its
   * registered sources -- e.g. a source reading a builder-wide setting
   * during {@link IConfigurationSource.build}. One mutable `Map` for the
   * builder's lifetime; mirrors the reference `IConfigurationBuilder`'s
   * `Properties` dictionary.
   */
  get properties(): Map<string, unknown>;

  /** The sources used to obtain configuration values. */
  get sources(): readonly IConfigurationSource[];

  /** Adds a new configuration source. Returns the same {@link IConfigurationBuilder}. */
  add(source: IConfigurationSource): IConfigurationBuilder;

  /**
   * Builds an {@link IConfiguration} with keys and values from the set of
   * sources registered in {@link IConfigurationBuilder.sources}.
   */
  build(): IConfigurationRoot;
}
