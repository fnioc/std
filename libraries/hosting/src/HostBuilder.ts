// HostBuilder -- the classic `IHostBuilder`, ported from the reference hosting
// runtime's `HostBuilder`. Accumulates host-config / app-config /
// configure-services delegates and, on `build()`, runs the reference build
// pipeline: host configuration -> hosting environment -> host-builder context ->
// application configuration -> framework services -> the internal host.
//
// Configuration flows through `@rhombus-std/config`'s `ConfigurationBuilder`
// (the provider `add*` sugar is installed by the `configureDefaults` extension,
// which side-effect-imports the provider packages). Service registration flows
// through `@rhombus-std/di`'s `ServiceManifest`.

import { ConfigurationManager } from '@rhombus-std/config';
import type { IConfigurationBuilder } from '@rhombus-std/config.core';
import { ServiceManifest } from '@rhombus-std/di';
import type { ServiceProviderFactory } from '@rhombus-std/di.core';
import type { HostBuilderContext, IHost, IHostBuilder } from '@rhombus-std/hosting.core';
import { augment } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import type { Action } from '@rhombus-toolkit/func';
import { createFrameworkServices, createHostingEnvironment, populateFrameworkServices,
  resolveHost } from './host-composition';
import { resolveServiceProviderOptions } from './service-provider-options-store';

// Interface-extends merge (augmentation doctrine): binding the IHostBuilder SYMBOL
// flows every in-program augmentation of the interface (hosting.core's `startHost`,
// this package's runtime members, downstream `useBrowserLifetime`, …) onto this
// concrete holder, so it satisfies `implements IHostBuilder` without restating any
// member.
export interface HostBuilder extends IHostBuilder {}

/** A program initialization utility -- the classic {@link IHostBuilder}. */
@augment(nameof<IHostBuilder>())
export class HostBuilder implements IHostBuilder {
  readonly properties = new Map<string | symbol, unknown>();

  readonly #configureHostConfigActions: Action<[IConfigurationBuilder]>[] = [];
  readonly #configureAppConfigActions: Action<[HostBuilderContext, IConfigurationBuilder]>[] = [];
  readonly #configureServicesActions: Action<[HostBuilderContext, ServiceManifest]>[] = [];
  readonly #configureContainerActions: Action<[HostBuilderContext, unknown]>[] = [];

  #hostBuilt = false;

  /** Sets up the configuration for the builder itself. Additive across calls. */
  public configureHostConfiguration(configureDelegate: Action<[IConfigurationBuilder]>): this {
    this.#configureHostConfigActions.push(configureDelegate);
    return this;
  }

  /** Sets up the configuration for the remainder of the build and application. Additive. */
  public configureAppConfiguration(
    configureDelegate: Action<[HostBuilderContext, IConfigurationBuilder]>,
  ): this {
    this.#configureAppConfigActions.push(configureDelegate);
    return this;
  }

  /** Adds services to the container. Additive across calls. */
  public configureServices(configureDelegate: Action<[HostBuilderContext, ServiceManifest]>): this {
    this.#configureServicesActions.push(configureDelegate);
    return this;
  }

  /**
   * Overrides the factory used to create the service provider. This repo has a
   * SINGLE container type, so this is a minimal no-op single-container hook: the
   * default `ServiceManifest` build path is always used to produce the provider.
   * See diNotes.
   */
  public useServiceProviderFactory<TContainerBuilder>(
    _factory: ServiceProviderFactory<TContainerBuilder>,
  ): this {
    return this;
  }

  /** Enables configuring the instantiated dependency container. Additive across calls. */
  public configureContainer<TContainerBuilder>(
    configureDelegate: Action<[HostBuilderContext, TContainerBuilder]>,
  ): this {
    this.#configureContainerActions.push(
      configureDelegate as Action<[HostBuilderContext, unknown]>,
    );
    return this;
  }

  /** Runs the configuration actions and produces an initialized {@link IHost}. */
  public build(): IHost {
    if (this.#hostBuilt) {
      throw new Error('Build can only be called once.');
    }
    this.#hostBuilt = true;

    // 1. Host configuration. A `ConfigurationManager` is used (not the
    // `ConfigurationBuilder`, which does not implement `IConfigurationBuilder`)
    // so it satisfies the `Action<[IConfigurationBuilder]>` delegate type.
    const hostConfigBuilder = new ConfigurationManager();
    for (const action of this.#configureHostConfigActions) {
      action(hostConfigBuilder);
    }
    const hostConfiguration = hostConfigBuilder.build();

    // 2. Hosting environment.
    const hostingEnvironment = createHostingEnvironment(hostConfiguration);

    // 3. Host-builder context.
    const hostBuilderContext: HostBuilderContext = {
      hostingEnvironment,
      configuration: hostConfiguration,
      properties: this.properties,
    };

    // 4. Application configuration (host configuration chained in first --
    // a live read-through, not a snapshot, so a later host-configuration
    // reload propagates into the application configuration too).
    const appConfigBuilder = new ConfigurationManager();
    appConfigBuilder.addConfiguration(hostConfiguration);
    for (const action of this.#configureAppConfigActions) {
      action(hostBuilderContext, appConfigBuilder);
    }
    const appConfiguration = appConfigBuilder.build();
    hostBuilderContext.configuration = appConfiguration;

    // 5. Framework services + the user's configure-services delegates.
    const services = new ServiceManifest();
    const framework = createFrameworkServices();
    populateFrameworkServices(services, hostBuilderContext, hostingEnvironment, appConfiguration, framework);

    for (const action of this.#configureServicesActions) {
      action(hostBuilderContext, services);
    }
    for (const action of this.#configureContainerActions) {
      action(hostBuilderContext, services);
    }

    // 6. Build the provider and construct the internal host. The service-provider
    // options (from `useDefaultServiceProvider` / `configureDefaults`) are
    // resolved now that the context exists, then threaded into `build()`.
    const serviceProviderOptions = resolveServiceProviderOptions(this, hostBuilderContext);
    return resolveHost(services, framework, appConfiguration, serviceProviderOptions);
  }
}
