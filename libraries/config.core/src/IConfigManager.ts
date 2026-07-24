import type { IConfig } from './IConfig';
import type { IConfigBuilder } from './IConfigBuilder';

/**
 * Represents a mutable configuration object. It is both an
 * {@link IConfigBuilder} and an {@link IConfig} -- as sources
 * are added, it updates its current view of configuration.
 */
export interface IConfigManager extends IConfig, IConfigBuilder {
}
