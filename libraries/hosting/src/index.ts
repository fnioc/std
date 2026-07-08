// Public entry point for @rhombus-std/hosting -- the Generic Host RUNTIME.
//
// Ships the two builders (`HostBuilder`, `HostApplicationBuilder`) + their
// settings, the static `Host` factory facade, the host runtime objects
// (`HostOptions`, the console lifetime + its options, the background-service
// exception behavior), and the `IHostBuilder` augmentation set
// (`HostingHostBuilderExtensions`). Re-exports the @rhombus-std/hosting.core
// public surface so a consumer reaches the whole hosting API through the single
// @rhombus-std/hosting import.
//
// IMPORTING THIS PACKAGE HAS A SIDE EFFECT: it installs the fluent method forms
// of the host / host-builder / host-environment augmentations onto their
// concrete classes (see ./host-augmentations), on top of hosting.core's
// `addHostedService` install.

// The hosting ABSTRACTIONS surface (contracts, tokens, host-lifetime + builder
// augmentation sets, environment predicates, BackgroundService, Environments,
// HostDefaults) + the `addHostedService` side-effect augmentation.
export * from "@rhombus-std/hosting.core";

// Side-effect: install the IHost / IHostBuilder / IHostEnvironment method forms
// onto the concrete Host / HostBuilder / HostingEnvironment classes.
import "./host-augmentations";

// The builders + factory facade.
export { Host } from "./host";
export { HostApplicationBuilder } from "./host-application-builder";
export { HostApplicationBuilderSettings } from "./host-application-builder-settings";
export { HostBuilder } from "./host-builder";

// Host runtime objects.
export { BackgroundServiceExceptionBehavior } from "./background-service-exception-behavior";
export { ConsoleLifetime, HOSTING_LIFETIME_CATEGORY } from "./console-lifetime";
export { ConsoleLifetimeOptions } from "./console-lifetime-options";
export { HostOptions } from "./host-options";
export { MetricsBuilder } from "./metrics-builder";
export { NullLifetime } from "./null-lifetime";

// The IHostBuilder augmentation set (reference HostingHostBuilderExtensions).
export { HostingHostBuilderExtensions, type ServiceProviderOptions } from "./builder-extensions";

// The environment-variable prefix the default host configuration reads.
export { HOST_ENVIRONMENT_VARIABLE_PREFIX } from "./default-configuration";

// The framework-service DI tokens (a consumer resolves these off `IHost.services`).
export {
  CONFIGURATION_TOKEN,
  CONSOLE_LIFETIME_OPTIONS_TOKEN,
  HOST_BUILDER_CONTEXT_TOKEN,
  HOST_ENVIRONMENT_TOKEN,
  HOST_LIFETIME_TOKEN,
  HOST_OPTIONS_TOKEN,
} from "./framework-tokens";
