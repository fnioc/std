import type { IServiceManifest } from './IServiceManifest.js';
import type { IResolver } from './provider.js';

/**
 * The two-step seam for swapping in a third-party container: adapt the collected
 * registrations into a container-specific builder, let the caller configure it,
 * then turn it into the resolvable provider the host runs against.
 *
 * @remarks
 * This repo has a SINGLE container type (`ServiceManifest` → `IServiceProvider`),
 * so nothing ships a non-trivial implementation and the hosting builders
 * accept-and-ignore it. The type exists so `IHostBuilder.useServiceProviderFactory`
 * and the modern builder's `configureContainer` name one shared type instead of
 * hand-rolling a shape at each call site.
 *
 * @typeParam TContainerBuilder - the container-specific builder this factory
 * mints and later consumes.
 */
export interface IServiceProviderFactory<TContainerBuilder> {
  /** Adapts the collected service registrations into a container-specific builder. */
  createBuilder(services: IServiceManifest): TContainerBuilder;
  /** Turns the (configured) container builder into the resolvable provider. */
  createServiceProvider(containerBuilder: TContainerBuilder): IResolver;
}
