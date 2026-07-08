// The provider-factory seam — the reference container's
// `IServiceProviderFactory<TContainerBuilder>` analog.
//
// A two-step hook for swapping in a third-party container builder: `createBuilder`
// adapts the collected `ServiceManifest` into a container-specific builder object,
// and `createServiceProvider` turns that (caller-configured) builder into the
// resolvable provider the host runs against.
//
// This repo has a SINGLE container type (`ServiceManifest` → `ServiceProvider`), so
// nothing ships a non-trivial implementation and the hosting builders accept-and-
// ignore it. The abstraction still lives here — rather than hand-rolled at each
// hosting call site — so `IHostBuilder.useServiceProviderFactory` and the modern
// builder's `configureContainer` name one shared di.core type. Pure type-level; it
// erases completely.

import type { Resolver } from "./provider.js";
import type { ServiceManifest } from "./service-manifest.js";

/**
 * The reference `IServiceProviderFactory<TContainerBuilder>` analog — a pluggable
 * seam that adapts the registration collection into a container builder, then turns
 * that builder into a resolvable provider.
 *
 * `TContainerBuilder` is the container-specific builder type the factory mints and
 * later consumes. With one container type here the seam is a no-op, but the shape is
 * shared so every hosting reference to it names a single di.core type.
 */
export interface ServiceProviderFactory<TContainerBuilder> {
  /** Adapts the collected service registrations into a container-specific builder. */
  createBuilder(services: ServiceManifest): TContainerBuilder;
  /** Turns the (configured) container builder into the resolvable provider. */
  createServiceProvider(containerBuilder: TContainerBuilder): Resolver;
}
