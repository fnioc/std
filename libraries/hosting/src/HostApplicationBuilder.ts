// HostApplicationBuilder -- the modern, property-based builder, ported from the
// reference hosting runtime's `HostApplicationBuilder`. Unlike the classic
// delegate-accumulating `HostBuilder`, it exposes its `config`,
// `environment`, `logging`, `metrics`, and `services` as live properties the
// caller mutates directly, then `build()` runs the same composition tail.
//
// `config` is a live `ConfigManager` (both an
// `IConfigBuilder` and an `IConfig`): adding a source updates its
// current view immediately, which is why the framework services are populated
// eagerly in the constructor but `HostOptions` is folded from the configuration
// at `build()` time (in the composition tail), once every source is present.

import { ConfigManager } from '@rhombus-std/config';
import type { IConfigManager } from '@rhombus-std/config.core';
import { ServiceManifest } from '@rhombus-std/di';
import type { IServiceManifest } from '@rhombus-std/di.core';
import type { IServiceProviderFactory, ServiceProviderOptions } from '@rhombus-std/di.core';
import type { IMetricsBuilder } from '@rhombus-std/diagnostics.core';
import { type HostBuilderContext, HostDefaults, type IHost, type IHostApplicationBuilder, type IHostBuilder,
  type IHostEnvironment } from '@rhombus-std/hosting.core';
import { LoggingBuilder } from '@rhombus-std/logging';
import type { ILoggingBuilder } from '@rhombus-std/logging.core';
import type { Action } from '@rhombus-toolkit/func';
import { addCommandLineConfig, addDefaultServices, applyDefaultAppConfig, createDefaultServiceProviderOptions,
  HOST_ENVIRONMENT_VARIABLE_PREFIX, setDefaultContentRoot } from './default-config';
import { createFrameworkServices, createHostingEnvironment, type FrameworkServices, populateFrameworkServices,
  resolveHost } from './host-composition';
import { HostApplicationBuilderSettings } from './HostApplicationBuilderSettings';
import { HostBuilderAdapter } from './internal/HostBuilderAdapter';
import { MetricsBuilder } from './MetricsBuilder';

/** A hosted applications and services builder -- the modern {@link IHostApplicationBuilder}. */
export class HostApplicationBuilder implements IHostApplicationBuilder {
  readonly #config: ConfigManager;
  readonly #services = new ServiceManifest();
  readonly #environment: IHostEnvironment;
  readonly #context: HostBuilderContext;
  readonly #logging: LoggingBuilder;
  readonly #metrics: MetricsBuilder;
  readonly #framework: FrameworkServices;
  readonly #serviceProviderOptions: ServiceProviderOptions | undefined;

  #hostBuilderAdapter?: HostBuilderAdapter;
  #hostBuilt = false;

  public constructor(settings?: HostApplicationBuilderSettings) {
    const resolved = settings ?? new HostApplicationBuilderSettings();
    this.#config = resolved.config instanceof ConfigManager
      ? resolved.config
      : new ConfigManager();
    this.#framework = createFrameworkServices();

    // Calls made directly on `this.#config` (a concrete
    // `ConfigManager`) below use the fluent `add*` sugar; calls routed
    // through a `default-config.ts` helper (`setDefaultContentRoot`,
    // `addCommandLineConfig`, `applyDefaultAppConfig`) stay in the raw
    // `.add(new Source(...))` form, because those helpers are typed against
    // the plain `IConfigBuilder` interface to stay reusable by the
    // classic `HostBuilder`'s delegate-typed configuration callbacks, which
    // never see a concrete class to hang the sugar off of.
    if (!resolved.disableDefaults) {
      if (
        resolved.contentRootPath === undefined && this.#config.get(HostDefaults.contentRootKey) === undefined
      ) {
        setDefaultContentRoot(this.#config);
      }
      this.#config.addEnvironmentVariables({ prefix: HOST_ENVIRONMENT_VARIABLE_PREFIX });
    }

    // Command-line args are added even when defaults are disabled: had the caller
    // not wanted them, they would not have set `args` on the settings.
    addCommandLineConfig(this.#config, resolved.args);

    // The settings values override all other configuration sources.
    const overrides: Record<string, string> = {};
    if (resolved.applicationName !== undefined) {
      overrides[HostDefaults.applicationKey] = resolved.applicationName;
    }
    if (resolved.environmentName !== undefined) {
      overrides[HostDefaults.environmentKey] = resolved.environmentName;
    }
    if (resolved.contentRootPath !== undefined) {
      overrides[HostDefaults.contentRootKey] = resolved.contentRootPath;
    }
    if (Object.keys(overrides).length) {
      this.#config.addInMemoryCollection(overrides);
    }

    this.#environment = createHostingEnvironment(this.#config);
    this.#context = {
      hostingEnvironment: this.#environment,
      config: this.#config,
      properties: new Map<string | symbol, unknown>(),
    };

    populateFrameworkServices(this.#services, this.#context, this.#environment, this.#config, this.#framework);

    if (!resolved.disableDefaults) {
      applyDefaultAppConfig(this.#config, this.#environment, resolved.args);
      addDefaultServices(this.#services);
    }

    // The reference computes the default service-provider options here (dev-env
    // scope/build validation) and threads them into the provider build. With
    // defaults disabled there is no factory, so the build stays unvalidated.
    this.#serviceProviderOptions = resolved.disableDefaults
      ? undefined
      : createDefaultServiceProviderOptions(this.#environment);

    this.#logging = new LoggingBuilder(this.#services);
    this.#metrics = new MetricsBuilder(this.#services);
  }

  /** A central location for sharing state between components during the build. */
  public get properties(): Map<string | symbol, unknown> {
    return this.#context.properties;
  }

  /** The mutable set of key/value configuration properties. */
  public get config(): IConfigManager {
    return this.#config;
  }

  /** Information about the hosting environment the application runs in. */
  public get environment(): IHostEnvironment {
    return this.#environment;
  }

  /** The collection of logging providers for the application to compose. */
  public get logging(): ILoggingBuilder {
    return this.#logging;
  }

  /** The builder that enables metrics and directs their output. */
  public get metrics(): IMetricsBuilder {
    return this.#metrics;
  }

  /** The collection of services for the application to compose. */
  public get services(): IServiceManifest {
    return this.#services;
  }

  /**
   * Registers a factory used to create the service provider. This repo has a
   * SINGLE container type, so this is a minimal no-op single-container hook: the
   * default `ServiceManifest` build path is always used. See diNotes.
   */
  public configureContainer<TContainerBuilder>(
    _factory: IServiceProviderFactory<TContainerBuilder>,
    _configure?: Action<[TContainerBuilder]>,
  ): void {}

  /**
   * Returns a classic {@link IHostBuilder} view over this builder -- the
   * reference `AsHostBuilder`. Lazily allocated and cached; the accumulated
   * configure* delegates are replayed at {@link build} time. Intended for tooling
   * that only understands the classic builder shape.
   */
  public asHostBuilder(): IHostBuilder {
    return this.#hostBuilderAdapter ??= new HostBuilderAdapter(
      this.#config,
      this.#services,
      this.#context,
    );
  }

  /** Builds the host. Can only be called once. */
  public build(): IHost {
    if (this.#hostBuilt) {
      throw new Error('Build can only be called once.');
    }
    this.#hostBuilt = true;
    // Replay any classic-builder delegates accumulated through `asHostBuilder()`
    // before the provider is built (reference parity).
    this.#hostBuilderAdapter?.applyChanges();
    return resolveHost(this.#services, this.#framework, this.#config, this.#serviceProviderOptions);
  }
}
