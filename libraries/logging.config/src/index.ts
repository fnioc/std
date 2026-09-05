// Importing this module installs the `addConfig` sugar onto ILoggingBuilder
// via the augmentation registry (./LoggingBuilder-Config-augmentations). This package MUST
// keep `"sideEffects": true` so a bundler cannot tree-shake that
// registration away.

export * from './ILoggerProviderConfig';
export type * from './ILoggerProviderConfigFactory';
export * from './LoggerFilterConfigureOptions';
export * from './LoggerProviderConfig';
export * from './LoggerProviderConfigFactory';
export * from './LoggerProviderConfigureOptions';
export * from './LoggerProviderOptions';
export * from './LoggerProviderOptionsChangeTokenSource';
export * from './LoggingBuilder-Config-augmentations';
export * from './LoggingConfig';
