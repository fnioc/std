// Public entry point for @rhombus-std/hosting.core: the host / hosted-service /
// lifetime / environment / builder contracts, the concrete values that live
// alongside them (BackgroundService, HostAbortedError, Environments,
// HostDefaults), and the shared DI-slot tokens.
//
// IMPORTING THIS PACKAGE HAS A SIDE EFFECT: it registers `addHostedService`
// against di.core's `ServiceManifest` augmentation token, and the IHost /
// IHostBuilder / IHostEnvironment augmentation sets against their own tokens
// (see HostLifecycleAugmentations.ts, HostBuilderStartAugmentations.ts,
// HostEnvironmentEnvAugmentations.ts, ServiceManifestHostedServiceAugmentations.ts).
// The concrete classes that consume those bags pull them onto their
// prototypes via `@augment`.

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

// Concrete values that live alongside the contracts above.
export { BackgroundService } from './BackgroundService';
export { Environments } from './Environments';
export { HostAbortedError } from './HostAbortedError';
export { HostDefaults } from './HostDefaults';

// The shared DI-slot token ABI (registration + resolution travel through these),
// plus the augmentation-registry tokens for the host/builder/environment
// receivers.
export { HOST_APPLICATION_LIFETIME_TYPE, HOSTED_SERVICE_TYPE, hostedServiceCollectionType } from './types';

// Host lifetime helpers + builder-start, as object-literal augmentation sets
// that register against their receiver tokens. Each set's members are also
// directly callable; the fluent method form is pulled onto the concrete
// classes via `@augment`.
export { HostLifecycleAugmentations } from './Host-Lifecycle-augmentations';
export { HostBuilderStartAugmentations } from './HostBuilder-Start-augmentations';

// Environment predicates.
export { HostEnvironmentEnvAugmentations } from './HostEnvironment-Env-augmentations';

// The `addHostedService` registration augmentation + its side-effect
// registration against di.core's ServiceManifest augmentation token.
export { ServiceManifestHostedServiceAugmentations } from './DefaultManifest-HostedService-augmentations';
