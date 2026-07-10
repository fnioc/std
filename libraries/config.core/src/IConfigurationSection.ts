// The `IConfigurationSection` interface -- mirrors MECA's
// `IConfigurationSection.cs` one-type-per-file layout (see docs/decisions.md #46).

import type { IConfiguration } from "./IConfiguration";

/** Represents a section of application configuration values. */
export interface IConfigurationSection extends IConfiguration {
  /** The key this section occupies in its parent. */
  get key(): string;

  /** The full path to this section within the {@link IConfiguration}. */
  get path(): string;

  /** The section value. */
  get value(): string | undefined;
  set value(value: string);
}
