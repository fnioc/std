// The `IConfigSection` interface -- mirrors MECA's
// `IConfigSection.cs` one-type-per-file layout (see docs/decisions.md #46).

import type { IConfig } from './IConfig';

/**
 * The brand a concrete {@link IConfigSection} stamps on itself (a public
 * symbol-keyed own property valued `true`) so the runtime discriminant
 * `isConfigSection` can recognize it, and so {@link IConfigSection} is nominal:
 * a root -- which structurally also exposes `key`/`path`/`value` -- cannot
 * satisfy it. Declared in config.core so the concrete section (in
 * @rhombus-std/config) and every consumer resolve the SAME symbol
 * (docs/decisions.md §38 identity invariant).
 */
export const configSectionBrand: unique symbol = Symbol('@rhombus-std/config.core#IConfigSection');

/** Represents a section of application configuration values. */
export interface IConfigSection extends IConfig {
  /** Nominal brand marking a genuine section; a root never carries it. */
  readonly [configSectionBrand]: true;

  /** The key this section occupies in its parent. */
  get key(): string;

  /** The full path to this section within the {@link IConfig}. */
  get path(): string;

  /** The section value. */
  get value(): string | undefined;
  set value(value: string);
}
