// Public entry point for @rhombus-std/hosting.core -- the hosting ABSTRACTIONS
// substrate (the reference Hosting.Abstractions analog, minus its [Obsolete]
// types: IApplicationLifetime, IHostingEnvironment, EnvironmentName,
// HostingEnvironmentExtensions).
//
// Ships the host/hosted-service/lifetime/environment/builder contracts, the
// concrete abstractions-package values the reference co-locates
// (BackgroundService, HostAbortedError, Environments, HostDefaults), the
// shared DI-slot tokens, and the reference extension methods as named
// object-literal augmentation sets (docs §28/§38).
//
// IMPORTING THIS PACKAGE HAS A SIDE EFFECT: it registers `addHostedService`
// against di.core's `ServiceManifest` augmentation token, and the IHost/
// IHostBuilder/IHostEnvironment augmentation sets against their own tokens (see
// ./hosted-service-augmentations, ./host-augmentations, ./host-builder-augmentations,
// ./host-environment-augmentations). The concrete `ServiceManifestClass` (di.core)
// and the concrete `Host`/`HostBuilder`/`HostingEnvironment` classes (downstream
// in `@rhombus-std/hosting`) pull those bags onto their prototypes via `@augment`.

// Core contracts.
export type { HostBuilderContext } from './HostBuilderContext';
export type { IHost } from './IHost';
export type { IHostApplicationBuilder } from './IHostApplicationBuilder';
export type { IHostApplicationLifetime } from './IHostApplicationLifetime';
export type { IHostBuilder } from './IHostBuilder';
export type { IHostedLifecycleService } from './IHostedLifecycleService';
export type { IHostedService } from './IHostedService';
export type { IHostEnvironment } from './IHostEnvironment';
export type { IHostLifetime } from './IHostLifetime';

// Concrete values the reference ships in the abstractions package.
export { BackgroundService } from './BackgroundService';
export { Environments } from './Environments';
export { HostAbortedError } from './HostAbortedError';
export { HostDefaults } from './HostDefaults';

// The shared DI-slot token ABI (registration + resolution travel through these),
// plus the augmentation-registry tokens for the OPEN host/builder/environment
// receivers (§38).
export { HOST_APPLICATION_LIFETIME_TOKEN, HOSTED_SERVICE_TOKEN, hostedServiceCollectionToken } from './tokens';

// Host lifetime helpers + builder-start (reference HostingAbstractionsHost*Extensions),
// authored as object-literal augmentation sets (docs §28/§38) that register
// against their receiver tokens. Their members are the standalone call surface;
// the fluent method form is pulled onto the concrete classes downstream via
// `@augment`.
export { HostingAbstractionsHostBuilderExtensions } from './HostingAbstractionsHostBuilderExtensions';
export { HostingAbstractionsHostExtensions } from './HostingAbstractionsHostExtensions';

// Environment predicates (reference HostEnvironmentEnvExtensions).
export { HostEnvironmentEnvExtensions } from './HostEnvironmentEnvExtensions';

// The `addHostedService` registration augmentation (reference's
// `AddHostedService` static class) + its side-effect registration against
// di.core's ServiceManifest augmentation token.
export { ServiceManifestHostedServiceAugmentations } from './ServiceManifestHostedServiceAugmentations';
