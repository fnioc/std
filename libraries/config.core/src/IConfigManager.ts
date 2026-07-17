// The `IConfigManager` interface -- mirrors MECA's
// `IConfigManager.cs` one-type-per-file layout (see docs/decisions.md
// #46). Lives in config.core alongside the other six IConfig* types:
// the reference source ships it in Abstractions, not the concrete engine.

import type { IConfig } from './IConfig';
import type { IConfigBuilder } from './IConfigBuilder';

/**
 * Represents a mutable configuration object. It is both an
 * {@link IConfigBuilder} and an {@link IConfig} -- as sources
 * are added, it updates its current view of configuration.
 */
export interface IConfigManager extends IConfig, IConfigBuilder {
}
