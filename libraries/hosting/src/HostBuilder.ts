// HostBuilder -- the classic `IHostBuilder`, ported from the reference hosting
// runtime's `HostBuilder`. Accumulates host-config / app-config /
// configure-services delegates and, on `build()`, runs the reference build
// pipeline: host configuration -> hosting environment -> host-builder context ->
// application configuration -> framework services -> the internal host.
//
// Configuration flows through `@rhombus-std/config`'s `ConfigBuilder`
// (the provider `add*` sugar is installed by the `configureDefaults` extension,
// which side-effect-imports the provider packages). Service registration flows
// through `@rhombus-std/di`'s `ServiceManifest`.

import { ConfigManager } from '@rhombus-std/config';
import type { IConfigBuilder } from '@rhombus-std/config.core';
import { ServiceManifest } from '@rhombus-std/di';
import type { IServiceManifest } from '@rhombus-std/di.core';
import type { IServiceProviderFactory } from '@rhombus-std/di.core';
import type { HostBuilderContext, IHost, IHostBuilder } from '@rhombus-std/hosting.core';
import { augment } from '@rhombus-std/primitives';
import { nameof } from '@rhombus-std/primitives';
import type { Action } from '@rhombus-toolkit/func';
import { createFrameworkServices, createHostingEnvironment, populateFrameworkServices,
  resolveHost } from './host-composition';
import { resolveServiceProviderOptions } from './ServiceProviderOptionsFactory';

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

  readonly #configureHostConfigActions: Array<Action<[IConfigBuilder]>> = [];
  readonly #configureAppConfigActions: Array<Action<[HostBuilderContext, IConfigBuilder]>> = [];
  readonly #configureServicesActions: Array<Action<[HostBuilderContext, IServiceManifest]>> = [];
  readonly #configureContainerActions: Array<Action<[HostBuilderContext, unknown]>> = [];

  #hostBuilt = false;

  /** Sets up the configuration for the builder itself. Additive across calls. */
  public configureHostConfig(configureDelegate: Action<[IConfigBuilder]>): this {
    this.#configureHostConfigActions.push(configureDelegate);
    return this;
  }

  /** Sets up the configuration for the remainder of the build and application. Additive. */
  public configureAppConfig(
    configureDelegate: Action<[HostBuilderContext, IConfigBuilder]>,
  ): this {
    this.#configureAppConfigActions.push(configureDelegate);
    return this;
  }

  /** Adds services to the container. Additive across calls. */
  public configureServices(configureDelegate: Action<[HostBuilderContext, IServiceManifest]>): this {
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
    _factory: IServiceProviderFactory<TContainerBuilder>,
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

    // 1. Host configuration. A `ConfigManager` is used (not the
    // `ConfigBuilder`, which does not implement `IConfigBuilder`)
    // so it satisfies the `Action<[IConfigBuilder]>` delegate type.
    const hostConfigBuilder = new ConfigManager();
    for (const action of this.#configureHostConfigActions) {
      action(hostConfigBuilder);
    }
    const hostConfig = hostConfigBuilder.build();

    // 2. Hosting environment.
    const hostingEnvironment = createHostingEnvironment(hostConfig);

    // 3. Host-builder context.
    const hostBuilderContext: HostBuilderContext = {
      hostingEnvironment,
      config: hostConfig,
      properties: this.properties,
    };

    // 4. Application configuration (host configuration chained in first --
    // a live read-through, not a snapshot, so a later host-configuration
    // reload propagates into the application configuration too).
    const appConfigBuilder = new ConfigManager();
    appConfigBuilder.addConfig(hostConfig);
    for (const action of this.#configureAppConfigActions) {
      action(hostBuilderContext, appConfigBuilder);
    }
    const appConfig = appConfigBuilder.build();
    hostBuilderContext.config = appConfig;

    // 5. Framework services + the user's configure-services delegates.
    const services = new ServiceManifest();
    const framework = createFrameworkServices();
    populateFrameworkServices(services, hostBuilderContext, hostingEnvironment, appConfig, framework);

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
    return resolveHost(services, framework, appConfig, serviceProviderOptions);
  }
}
