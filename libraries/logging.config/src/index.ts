// Importing this module installs the `addConfig` sugar onto ILoggingBuilder
// via the augmentation registry (./add-configuration). This package MUST
// keep `"sideEffects": true` so a bundler cannot tree-shake that
// registration away.

export { LoggingBuilderExtensions } from './add-configuration';
export { type ILoggerProviderConfig, loggerProviderConfigToken } from './ILoggerProviderConfig';
export type { ILoggerProviderConfigFactory } from './ILoggerProviderConfigFactory';
export { LoggerFilterConfigureOptions } from './LoggerFilterConfigureOptions';
export { LoggerProviderConfig } from './LoggerProviderConfig';
export { LoggerProviderConfigFactory } from './LoggerProviderConfigFactory';
export { LoggerProviderConfigureOptions } from './LoggerProviderConfigureOptions';
export { LoggerProviderOptions } from './LoggerProviderOptions';
export { LoggerProviderOptionsChangeTokenSource } from './LoggerProviderOptionsChangeTokenSource';
export { LoggingConfig } from './LoggingConfig';
