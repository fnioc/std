// Public entry point for @rhombus-std/hosting -- the Generic Host runtime.
// Re-exports @rhombus-std/hosting.core so a consumer reaches the whole hosting
// API through this single import.
//
// Importing this package installs the fluent method forms of the host /
// host-builder / host-environment augmentations onto their concrete classes.

export * from '@rhombus-std/hosting.core';

// Side-effect import: registers HostBuilderHostingAugmentations.
import './HostBuilder-Hosting-augmentations';

export * from './Host';
export * from './HostApplicationBuilder';
export * from './HostApplicationBuilderSettings';
export * from './HostBuilder';

export * from './BackgroundServiceErrorBehavior';
export * from './ConsoleLifetimeOptions';
export * from './HostOptions';
export * from './internal/ConsoleLifetime';
export * from './internal/NullLifetime';
export { MetricsBuilder } from './MetricsBuilder';

export * from './HostBuilder-Hosting-augmentations';

// Re-exported from the engine, which owns it; this is the type
// `useDefaultServiceProvider` configures.
export type { ServiceProviderOptions } from '@rhombus-std/di';

// The environment-variable prefix the default host configuration reads.
export { HOST_ENVIRONMENT_VARIABLE_PREFIX } from './default-config';

// The framework-service DI tokens (a consumer resolves these off `IHost.services`).
export { CONFIG_TYPE, CONSOLE_LIFETIME_OPTIONS_TYPE, HOST_BUILDER_CONTEXT_TYPE, HOST_ENVIRONMENT_TYPE,
  HOST_LIFETIME_TYPE, HOST_OPTIONS_TYPE } from './framework-types';
