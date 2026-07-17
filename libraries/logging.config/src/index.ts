// Public entry point for @rhombus-std/logging.config — the reference
// logging configuration project's analog, at full surface parity:
//
//   - `addConfig` (the `LoggingBuilderExtensions` augmentation set) —
//     the lazy, reload-reactive `IOptions<LoggerFilterOptions>` pipeline plus
//     (no-arg arity) the provider-configuration services;
//   - the provider-configuration surface: `ILoggerProviderConfigFactory`
//     / `ILoggerProviderConfig<T>` and their concrete classes;
//   - `LoggerProviderOptions.registerProviderOptions` — provider-section
//     binding for a provider package's options type — with its
//     `LoggerProviderConfigureOptions` / `LoggerProviderOptionsChangeTokenSource`
//     steps;
//   - the `LoggerFilterConfigureOptions` configure step and the
//     `LoggingConfig` holder.
//
// Importing this module also installs the `addConfig` sugar onto
// ILoggingBuilder via the augmentation registry (./add-configuration). This
// package MUST keep `"sideEffects": true` so a bundler cannot tree-shake that
// registration away.

// Side-effect + standalone surface: registers the `addConfig`
// augmentation against the logging-builder token and exports the set (docs §38).
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
