import type { IConfigManager } from '@rhombus-std/config.core';
import type { Manifest } from '@rhombus-std/di.core';
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
  readonly config: IConfigManager;

  /** Information about the hosting environment an application is running in. */
  readonly environment: IHostEnvironment;

  /** A collection of logging providers for the application to compose. */
  readonly logging: ILoggingBuilder;

  /** A builder that allows enabling metrics and directing their output. */
  readonly metrics: IMetricsBuilder;

  /**
   * A collection of services for the application to compose. WRITABLE (a
   * di.core `ManifestSlot`): the manifest chain is immutable, so
   * registering something reassigns `builder.services =
   * builder.services.addClass(...)`. The same slot backs `logging` and `metrics`, so
   * every registration route lands on one chain.
   */
  services: Manifest;

  /**
   * Configures the instantiated dependency container. The `configure` delegate
   * runs after all other services have been registered. Multiple calls replace
   * the previously stored delegate.
   *
   * @remarks
   * `TContainerBuilder` is always the {@link Manifest} this host builds.
   */
  configureContainer<TContainerBuilder>(configure?: Action<[TContainerBuilder]>): void;
}
