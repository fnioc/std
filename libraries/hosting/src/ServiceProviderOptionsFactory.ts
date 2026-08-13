// A package-internal side channel carrying the pending ServiceProviderOptions
// for a classic HostBuilder from the point they are chosen (configureDefaults /
// useDefaultServiceProvider) to the point the provider is built
// (HostBuilder.build()).
//
// This repo has a single container type, so the options ride the builder's
// own `properties` bag instead, under a module-private symbol key:
// `HostBuilder.build()` already threads that same Map into
// `HostBuilderContext.properties`, so it's exactly the per-builder build-time
// store this needs — holding a build-time factory so the dev-environment
// default (which depends on the resolved hosting environment) can be computed
// once the context exists. Last write wins.

import type { ServiceProviderOptions } from '@rhombus-std/di';
import type { HostBuilderContext, IHostBuilder } from '@rhombus-std/hosting.core';

/** Produces the {@link ServiceProviderOptions} from the fully-resolved build context. */
export type ServiceProviderOptionsFactory = (context: HostBuilderContext) => ServiceProviderOptions;

const SERVICE_PROVIDER_OPTIONS_FACTORY = Symbol('serviceProviderOptionsFactory');

/** Records the options factory a later `build()` will invoke; overwrites any prior one. */
export function setServiceProviderOptionsFactory(builder: IHostBuilder, factory: ServiceProviderOptionsFactory): void {
  builder.properties.set(SERVICE_PROVIDER_OPTIONS_FACTORY, factory);
}

/**
 * Resolves the recorded options against `context`, or `undefined` when none was
 * set (a plain, unvalidated build).
 */
export function resolveServiceProviderOptions(builder: IHostBuilder, context: HostBuilderContext):
  | ServiceProviderOptions
  | undefined {
  const factory = builder.properties.get(SERVICE_PROVIDER_OPTIONS_FACTORY) as ServiceProviderOptionsFactory | undefined;
  return factory?.(context);
}
