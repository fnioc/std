// A package-internal side channel carrying the pending ServiceProviderOptions
// for a classic HostBuilder from the point they are chosen (configureDefaults /
// useDefaultServiceProvider) to the point the provider is built
// (HostBuilder.build()).
//
// The reference threads these options through its pluggable service-provider
// factory (`UseServiceProviderFactory(context => new
// DefaultServiceProviderFactory(options))`). This repo has a SINGLE container
// type and its `build()` ignores that seam (docs §24), so the options can't ride
// the factory. They ride this WeakMap instead: keyed by the builder, holding a
// build-time factory so the dev-environment default (which depends on the
// resolved hosting environment) can be computed once the context exists. Last
// write wins, mirroring the reference's last-`UseServiceProviderFactory`.

import type { ServiceProviderOptions } from "@rhombus-std/di.core";
import type { HostBuilderContext, IHostBuilder } from "@rhombus-std/hosting.core";

/** Produces the {@link ServiceProviderOptions} from the fully-resolved build context. */
export type ServiceProviderOptionsFactory = (context: HostBuilderContext) => ServiceProviderOptions;

const factories = new WeakMap<IHostBuilder, ServiceProviderOptionsFactory>();

/** Records the options factory a later `build()` will invoke; overwrites any prior one. */
export function setServiceProviderOptionsFactory(
  builder: IHostBuilder,
  factory: ServiceProviderOptionsFactory,
): void {
  factories.set(builder, factory);
}

/**
 * Resolves the recorded options against `context`, or `undefined` when none was
 * set (a plain, unvalidated build).
 */
export function resolveServiceProviderOptions(
  builder: IHostBuilder,
  context: HostBuilderContext,
): ServiceProviderOptions | undefined {
  return factories.get(builder)?.(context);
}
