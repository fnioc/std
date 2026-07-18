// Public entry point for @rhombus-std/hosting -- the Generic Host RUNTIME.
//
// Ships the two builders (`HostBuilder`, `HostApplicationBuilder`) + their
// settings, the static `Host` factory facade, the host runtime objects
// (`HostOptions`, the console lifetime + its options, the background-service
// error behavior), and the `IHostBuilder` augmentation set
// (`HostingHostBuilderAugmentations`). Re-exports the @rhombus-std/hosting.core
// public surface so a consumer reaches the whole hosting API through the single
// @rhombus-std/hosting import.
//
// IMPORTING THIS PACKAGE HAS A SIDE EFFECT: it installs the fluent method forms
// of the host / host-builder / host-environment augmentations onto their
// concrete classes. Each concrete class is decorated with
// `@augment(<receiver>_AUGMENTATION_TOKEN)` at its definition, so loading it
// pulls its receiver's registered bag onto the prototype; `./host-augmentations`
// carries the class-side type merges. This rides on top of hosting.core's
// `addHostedService` registration.

// The hosting ABSTRACTIONS surface (contracts, tokens, host-lifetime + builder
// augmentation sets, environment predicates, BackgroundService, Environments,
// HostDefaults) + the `addHostedService` side-effect augmentation.
export * from '@rhombus-std/hosting.core';

// Bring the runtime registration of the IHostBuilder set into the program so
// `HostingHostBuilderAugmentations` is registered. The concrete classes satisfy their
// augmented interfaces via their own `interface ... extends I` merges (beside each
// class), so no class-side augmentation module is needed.
import './HostingHostBuilderAugmentations';

// The builders + factory facade.
export { Host } from './Host';
export { HostApplicationBuilder } from './HostApplicationBuilder';
export { HostApplicationBuilderSettings } from './HostApplicationBuilderSettings';
export { HostBuilder } from './HostBuilder';

// Host runtime objects.
export { BackgroundServiceErrorBehavior } from './BackgroundServiceErrorBehavior';
export { ConsoleLifetimeOptions } from './ConsoleLifetimeOptions';
export { HostOptions } from './HostOptions';
export { ConsoleLifetime, HOSTING_LIFETIME_CATEGORY } from './internal/ConsoleLifetime';
export { NullLifetime } from './internal/NullLifetime';
export { MetricsBuilder } from './MetricsBuilder';

// The IHostBuilder augmentation set (reference HostingHostBuilderExtensions).
export { HostingHostBuilderAugmentations } from './HostingHostBuilderAugmentations';

// The provider-construction options `useDefaultServiceProvider` configures
// (reference ServiceProviderOptions) — re-exported from di.core, which owns it.
export type { ServiceProviderOptions } from '@rhombus-std/di.core';

// The environment-variable prefix the default host configuration reads.
export { HOST_ENVIRONMENT_VARIABLE_PREFIX } from './default-config';

// The framework-service DI tokens (a consumer resolves these off `IHost.services`).
export { CONFIG_TOKEN, CONSOLE_LIFETIME_OPTIONS_TOKEN, HOST_BUILDER_CONTEXT_TOKEN, HOST_ENVIRONMENT_TOKEN,
  HOST_LIFETIME_TOKEN, HOST_OPTIONS_TOKEN } from './framework-tokens';
