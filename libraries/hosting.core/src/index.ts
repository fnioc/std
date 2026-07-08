// Public entry point for @rhombus-std/hosting.core -- the hosting ABSTRACTIONS
// substrate (the reference Hosting.Abstractions analog, minus its [Obsolete]
// types: IApplicationLifetime, IHostingEnvironment, EnvironmentName,
// HostingEnvironmentExtensions).
//
// Ships the host/hosted-service/lifetime/environment/builder contracts, the
// concrete abstractions-package values the reference co-locates
// (BackgroundService, HostAbortedException, Environments, HostDefaults), the
// shared DI-slot tokens, and the reference extension methods as named
// object-literal augmentation sets (docs §28) / a side-effect augmentation (the
// §0 directive).
//
// IMPORTING THIS PACKAGE HAS A SIDE EFFECT: it installs `addHostedService` onto
// di.core's registration builder (see ./hosted-service-registration). The IHost/
// IHostBuilder/IHostEnvironment method-form installs live downstream in
// `@rhombus-std/hosting` against their concrete classes (cross-package rule).

// Core contracts.
export type { IHost } from "./host";
export type { IHostApplicationBuilder } from "./host-application-builder";
export type { IHostApplicationLifetime } from "./host-application-lifetime";
export type { IHostBuilder } from "./host-builder";
export type { HostBuilderContext } from "./host-builder-context";
export type { IHostEnvironment } from "./host-environment";
export type { IHostLifetime } from "./host-lifetime";
export type { IHostedLifecycleService } from "./hosted-lifecycle-service";
export type { IHostedService } from "./hosted-service";

// Concrete values the reference ships in the abstractions package.
export { BackgroundService } from "./background-service";
export { Environments } from "./environments";
export { HostAbortedException } from "./host-aborted-exception";
export { HostDefaults } from "./host-defaults";

// The shared DI-slot token ABI (registration + resolution travel through these).
export { HOST_APPLICATION_LIFETIME_TOKEN, HOSTED_SERVICE_TOKEN, hostedServiceCollectionToken } from "./tokens";

// Host lifetime helpers + builder-start (reference HostingAbstractionsHost*Extensions),
// authored as object-literal augmentation sets (docs §28). Their members are the
// standalone call surface; the fluent method form is installed downstream in
// `@rhombus-std/hosting`.
export { HostingAbstractionsHostBuilderExtensions } from "./host-builder-extensions";
export { HostingAbstractionsHostExtensions } from "./host-extensions";

// Environment predicates (reference HostEnvironmentEnvExtensions).
export { HostEnvironmentEnvExtensions } from "./host-environment-extensions";

// The `addHostedService` registration augmentation (reference
// ServiceCollectionHostedServiceExtensions) + its side-effect install onto
// di.core's ServiceManifest.
export { ServiceCollectionHostedServiceExtensions } from "./hosted-service-registration";
