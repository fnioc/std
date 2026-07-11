// Public entry point for @rhombus-std/logging.configuration — the reference
// logging configuration project's analog, at full surface parity:
//
//   - `addConfiguration` (the `LoggingBuilderExtensions` augmentation set) —
//     the lazy, reload-reactive `Options<LoggerFilterOptions>` pipeline plus
//     (no-arg arity) the provider-configuration services;
//   - the provider-configuration surface: `ILoggerProviderConfigurationFactory`
//     / `ILoggerProviderConfiguration<T>` and their concrete classes;
//   - `LoggerProviderOptions.registerProviderOptions` — provider-section
//     binding for a provider package's options type — with its
//     `LoggerProviderConfigureOptions` / `LoggerProviderOptionsChangeTokenSource`
//     steps;
//   - the `LoggerFilterConfigureOptions` configure step and the
//     `LoggingConfiguration` holder.
//
// Importing this module also installs the `addConfiguration` sugar onto
// ILoggingBuilder via the augmentation registry (./add-configuration). This
// package MUST keep `"sideEffects": true` so a bundler cannot tree-shake that
// registration away.

// Side-effect + standalone surface: registers the `addConfiguration`
// augmentation against the logging-builder token and exports the set (docs §38).
export { LoggingBuilderExtensions } from './add-configuration';
export { type ILoggerProviderConfiguration, loggerProviderConfigurationToken } from './ILoggerProviderConfiguration';
export type { ILoggerProviderConfigurationFactory } from './ILoggerProviderConfigurationFactory';
export { LoggerFilterConfigureOptions } from './LoggerFilterConfigureOptions';
export { LoggerProviderConfiguration } from './LoggerProviderConfiguration';
export { LoggerProviderConfigurationFactory } from './LoggerProviderConfigurationFactory';
export { LoggerProviderConfigureOptions } from './LoggerProviderConfigureOptions';
export { LoggerProviderOptions } from './LoggerProviderOptions';
export { LoggerProviderOptionsChangeTokenSource } from './LoggerProviderOptionsChangeTokenSource';
export { LoggingConfiguration } from './LoggingConfiguration';
