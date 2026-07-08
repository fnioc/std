import type { IConfigurationBuilder } from "@rhombus-std/config.core";
import type { ServiceManifest, ServiceProviderFactory } from "@rhombus-std/di.core";
import type { Action } from "@rhombus-toolkit/func";
import type { IHost } from "./host";
import type { HostBuilderContext } from "./host-builder-context";

/**
 * A program initialization abstraction. The primary API surface for assembling
 * a host: configuration wiring (`@rhombus-std/config`) and service registration
 * (`@rhombus-std/di`'s {@link ServiceManifest}) are threaded through the
 * configure delegates.
 */
export interface IHostBuilder {
  /**
   * A central location for sharing state between components during the host
   * building process.
   */
  readonly properties: Map<string | symbol, unknown>;

  /**
   * Sets up the configuration for the builder itself. Used to initialize the
   * {@link IHostEnvironment} for later in the build. Additive across calls.
   */
  configureHostConfiguration(configureDelegate: Action<[IConfigurationBuilder]>): this;

  /**
   * Sets up the configuration for the remainder of the build and the
   * application. Additive across calls; results are exposed at
   * {@link HostBuilderContext.configuration} and in {@link IHost.services}.
   */
  configureAppConfiguration(
    configureDelegate: Action<[HostBuilderContext, IConfigurationBuilder]>,
  ): this;

  /** Adds services to the container. Additive across calls. */
  configureServices(configureDelegate: Action<[HostBuilderContext, ServiceManifest]>): this;

  /**
   * Overrides the factory used to create the service provider.
   *
   * This repo has a SINGLE container type ({@link ServiceManifest}), so the
   * reference's `IServiceProviderFactory<TContainerBuilder>` — di.core's shared
   * {@link ServiceProviderFactory} — is accepted but the default `ServiceManifest`
   * build path is always used. See diNotes.
   */
  useServiceProviderFactory<TContainerBuilder>(
    factory: ServiceProviderFactory<TContainerBuilder>,
  ): this;

  /**
   * Enables configuring the instantiated dependency container. Additive across
   * calls.
   */
  configureContainer<TContainerBuilder>(
    configureDelegate: Action<[HostBuilderContext, TContainerBuilder]>,
  ): this;

  /** Runs the configuration actions and produces an initialized {@link IHost}. */
  build(): IHost;
}
