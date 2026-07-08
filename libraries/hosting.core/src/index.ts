// Public entry point for @rhombus-std/hosting.core -- the hosting ABSTRACTIONS
// substrate (the reference Hosting.Abstractions analog, minus its [Obsolete]
// types: IApplicationLifetime, IHostingEnvironment, EnvironmentName,
// HostingEnvironmentExtensions).
//
// Ships the host/hosted-service/lifetime/environment/builder contracts, the
// concrete abstractions-package values the reference co-locates
// (BackgroundService, HostAbortedException, Environments, HostDefaults), the
// shared DI-slot tokens, and the reference extension methods as named functions
// / a side-effect augmentation (the §0 directive).
//
// IMPORTING THIS PACKAGE HAS A SIDE EFFECT: it installs `addHostedService` onto
// di.core's registration builder (see ./hosted-service-registration).

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

// Host lifetime helpers (reference HostingAbstractionsHost*Extensions as named
// functions; see the module headers and diNotes for why not fluent methods).
export { startHost } from "./host-builder-extensions";
export { run, runAsync, stopWithTimeout, waitForShutdownAsync } from "./host-extensions";

// Environment predicates (reference HostEnvironmentEnvExtensions).
export { isDevelopment, isEnvironment, isProduction, isStaging } from "./host-environment-extensions";

// Side-effect: install `addHostedService` onto di.core's ServiceManifest.
import "./hosted-service-registration";
