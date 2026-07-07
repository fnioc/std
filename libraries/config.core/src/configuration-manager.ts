// The `IConfigurationManager` interface -- mirrors MECA's
// `IConfigurationManager.cs` one-type-per-file layout (see docs/decisions.md
// #46). Lives in config.core alongside the other six IConfiguration* types:
// the reference source ships it in Abstractions, not the concrete engine.

import type { IConfiguration } from "./configuration";
import type { IConfigurationBuilder } from "./configuration-builder";

/**
 * Represents a mutable configuration object. It is both an
 * {@link IConfigurationBuilder} and an {@link IConfiguration} -- as sources
 * are added, it updates its current view of configuration.
 */
export interface IConfigurationManager extends IConfiguration, IConfigurationBuilder {
}
