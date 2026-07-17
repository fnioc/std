import type { IConfigurationManager } from '@rhombus-std/config.core';
import type { IServiceManifest, IServiceProviderFactory } from '@rhombus-std/di.core';
import type { IMetricsBuilder } from '@rhombus-std/diagnostics.core';
import type { ILoggingBuilder } from '@rhombus-std/logging.core';
import type { Action } from '@rhombus-toolkit/func';
import type { IHostEnvironment } from './IHostEnvironment';

/**
 * A hosted applications and services builder that helps manage configuration,
 * logging, lifetime, and more.
 */
export interface IHostApplicationBuilder {
  /**
   * A central location for sharing state between components during the host
   * building process.
   */
  readonly properties: Map<string | symbol, unknown>;

  /**
   * The set of key/value configuration properties. Mutable: adding more
   * configuration sources updates its current view.
   */
  readonly configuration: IConfigurationManager;

  /** Information about the hosting environment an application is running in. */
  readonly environment: IHostEnvironment;

  /** A collection of logging providers for the application to compose. */
  readonly logging: ILoggingBuilder;

  /** A builder that allows enabling metrics and directing their output. */
  readonly metrics: IMetricsBuilder;

  /** A collection of services for the application to compose. */
  readonly services: IServiceManifest;

  /**
   * Registers a factory used to create the service provider. The `configure`
   * delegate runs after all other services have been registered. Multiple calls
   * replace the previously stored factory and delegate.
   *
   * As on {@link IHostBuilder.useServiceProviderFactory}, the single-container
   * model accepts di.core's shared {@link IServiceProviderFactory} but always uses
   * the one real container. See diNotes.
   */
  configureContainer<TContainerBuilder>(
    factory: IServiceProviderFactory<TContainerBuilder>,
    configure?: Action<[TContainerBuilder]>,
  ): void;
}
