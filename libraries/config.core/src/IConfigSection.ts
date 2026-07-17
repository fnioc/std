// The `IConfigSection` interface -- mirrors MECA's
// `IConfigSection.cs` one-type-per-file layout (see docs/decisions.md #46).

import type { IConfig } from './IConfig';

/** Represents a section of application configuration values. */
export interface IConfigSection extends IConfig {
  /** The key this section occupies in its parent. */
  get key(): string;

  /** The full path to this section within the {@link IConfig}. */
  get path(): string;

  /** The section value. */
  get value(): string | undefined;
  set value(value: string);
}
