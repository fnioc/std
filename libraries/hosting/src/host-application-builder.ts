// HostApplicationBuilder -- the modern, property-based builder, ported from the
// reference hosting runtime's `HostApplicationBuilder`. Unlike the classic
// delegate-accumulating `HostBuilder`, it exposes its `configuration`,
// `environment`, `logging`, `metrics`, and `services` as live properties the
// caller mutates directly, then `build()` runs the same composition tail.
//
// `configuration` is a live `ConfigurationManager` (both an
// `IConfigurationBuilder` and an `IConfiguration`): adding a source updates its
// current view immediately, which is why the framework services are populated
// eagerly in the constructor but `HostOptions` is folded from the configuration
// at `build()` time (in the composition tail), once every source is present.

import { ConfigurationManager, MemoryConfigurationSource } from "@rhombus-std/config";
import type { IConfigurationManager } from "@rhombus-std/config.core";
import { EnvironmentVariablesConfigurationSource } from "@rhombus-std/config.env";
import { ServiceManifest } from "@rhombus-std/di";
import type { ServiceProviderFactory } from "@rhombus-std/di.core";
import type { IMetricsBuilder } from "@rhombus-std/diagnostics.core";
import type { HostBuilderContext, IHost, IHostApplicationBuilder, IHostEnvironment } from "@rhombus-std/hosting.core";
import { HostDefaults } from "@rhombus-std/hosting.core";
import { LoggingBuilder } from "@rhombus-std/logging";
import type { ILoggingBuilder } from "@rhombus-std/logging.core";
import type { Action } from "@rhombus-toolkit/func";
import {
  addCommandLineConfig,
  addDefaultServices,
  applyDefaultAppConfiguration,
  HOST_ENVIRONMENT_VARIABLE_PREFIX,
  setDefaultContentRoot,
} from "./default-configuration";
import { HostApplicationBuilderSettings } from "./host-application-builder-settings";
import {
  createFrameworkServices,
  createHostingEnvironment,
  type FrameworkServices,
  populateFrameworkServices,
  resolveHost,
} from "./host-composition";
import { MetricsBuilder } from "./metrics-builder";

/** A hosted applications and services builder -- the modern {@link IHostApplicationBuilder}. */
export class HostApplicationBuilder implements IHostApplicationBuilder {
  readonly #configuration: ConfigurationManager;
  readonly #services = new ServiceManifest();
  readonly #environment: IHostEnvironment;
  readonly #context: HostBuilderContext;
  readonly #logging: LoggingBuilder;
  readonly #metrics: MetricsBuilder;
  readonly #framework: FrameworkServices;

  #hostBuilt = false;

  public constructor(settings?: HostApplicationBuilderSettings) {
    const resolved = settings ?? new HostApplicationBuilderSettings();
    this.#configuration = resolved.configuration instanceof ConfigurationManager
      ? resolved.configuration
      : new ConfigurationManager();
    this.#framework = createFrameworkServices();

    if (!resolved.disableDefaults) {
      if (
        resolved.contentRootPath === undefined && this.#configuration.get(HostDefaults.contentRootKey) === undefined
      ) {
        setDefaultContentRoot(this.#configuration);
      }
      this.#configuration.add(
        new EnvironmentVariablesConfigurationSource({ prefix: HOST_ENVIRONMENT_VARIABLE_PREFIX }),
      );
    }

    // Command-line args are added even when defaults are disabled: had the caller
    // not wanted them, they would not have set `args` on the settings.
    addCommandLineConfig(this.#configuration, resolved.args);

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
      this.#configuration.add(new MemoryConfigurationSource({ initialData: overrides }));
    }

    this.#environment = createHostingEnvironment(this.#configuration);
    this.#context = {
      hostingEnvironment: this.#environment,
      configuration: this.#configuration,
      properties: new Map<string | symbol, unknown>(),
    };

    populateFrameworkServices(this.#services, this.#context, this.#environment, this.#configuration, this.#framework);

    if (!resolved.disableDefaults) {
      applyDefaultAppConfiguration(this.#configuration, this.#environment, resolved.args);
      addDefaultServices(this.#services);
    }

    this.#logging = new LoggingBuilder(this.#services);
    this.#metrics = new MetricsBuilder(this.#services);
  }

  /** A central location for sharing state between components during the build. */
  public get properties(): Map<string | symbol, unknown> {
    return this.#context.properties;
  }

  /** The mutable set of key/value configuration properties. */
  public get configuration(): IConfigurationManager {
    return this.#configuration;
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
  public get services(): ServiceManifest {
    return this.#services;
  }

  /**
   * Registers a factory used to create the service provider. This repo has a
   * SINGLE container type, so this is a minimal no-op single-container hook: the
   * default `ServiceManifest` build path is always used. See diNotes.
   */
  public configureContainer<TContainerBuilder>(
    _factory: ServiceProviderFactory<TContainerBuilder>,
    _configure?: Action<[TContainerBuilder]>,
  ): void {}

  /** Builds the host. Can only be called once. */
  public build(): IHost {
    if (this.#hostBuilt) {
      throw new Error("Build can only be called once.");
    }
    this.#hostBuilt = true;
    return resolveHost(this.#services, this.#framework, this.#configuration);
  }
}
