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
export type * from './HostBuilderContext';
export type * from './IHost';
export type * from './IHostApplicationBuilder';
export type * from './IHostApplicationLifetime';
export type * from './IHostBuilder';
export type * from './IHostedLifecycleService';
export type * from './IHostedService';
export type * from './IHostEnvironment';
export type * from './IHostLifetime';

// Concrete values that live alongside the contracts above.
export * from './BackgroundService';
export * from './Environments';
export * from './HostAbortedError';
export * from './HostDefaults';

// The shared DI-slot token ABI (registration + resolution travel through these),
// plus the augmentation-registry tokens for the host/builder/environment
// receivers.
export * from './types';

// Host lifetime helpers + builder-start, as object-literal augmentation sets
// that register against their receiver tokens. Each set's members are also
// directly callable; the fluent method form is pulled onto the concrete
// classes via `@augment`.
export * from './Host-Lifecycle-augmentations';
export * from './HostBuilder-Start-augmentations';

// Environment predicates.
export * from './HostEnvironment-Env-augmentations';

// The `addHostedService` registration augmentation + its side-effect
// registration against di.core's ServiceManifest augmentation token.
export * from './DefaultManifest-HostedService-augmentations';
