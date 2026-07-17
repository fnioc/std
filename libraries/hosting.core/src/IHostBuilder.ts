import type { IConfigBuilder } from '@rhombus-std/config.core';
import type { IServiceManifest, IServiceProviderFactory } from '@rhombus-std/di.core';
import type { Action } from '@rhombus-toolkit/func';
import type { HostBuilderContext } from './HostBuilderContext';
import type { IHost } from './IHost';

/**
 * A program initialization abstraction. The primary API surface for assembling
 * a host: configuration wiring (`@rhombus-std/config`) and service registration
 * (`@rhombus-std/di`'s {@link IServiceManifest}) are threaded through the
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
  configureHostConfiguration(configureDelegate: Action<[IConfigBuilder]>): this;

  /**
   * Sets up the configuration for the remainder of the build and the
   * application. Additive across calls; results are exposed at
   * {@link HostBuilderContext.configuration} and in {@link IHost.services}.
   *
   * This is the reference's context form (the `IHostBuilder` interface method).
   * The reference also offers a no-context `Action<IConfigBuilder>`
   * convenience extension; it is intentionally not surfaced here — a TS overload
   * on this method can't distinguish the two forms for an un-annotated lambda
   * without degrading contextual typing of this dominant context form, and every
   * in-repo caller uses the context form. A hand author writes the two-parameter
   * form with an unused first parameter.
   */
  configureAppConfiguration(
    configureDelegate: Action<[HostBuilderContext, IConfigBuilder]>,
  ): this;

  /** Adds services to the container. Additive across calls. (Context form; see {@link configureAppConfiguration} on the omitted no-context convenience.) */
  configureServices(configureDelegate: Action<[HostBuilderContext, IServiceManifest]>): this;

  /**
   * Overrides the factory used to create the service provider.
   *
   * This repo has a SINGLE container type ({@link IServiceManifest}), so the
   * reference's `IServiceProviderFactory<TContainerBuilder>` — di.core's shared
   * {@link IServiceProviderFactory} — is accepted but the default `IServiceManifest`
   * build path is always used. See diNotes.
   */
  useServiceProviderFactory<TContainerBuilder>(
    factory: IServiceProviderFactory<TContainerBuilder>,
  ): this;

  /** Enables configuring the instantiated dependency container. Additive across calls. (Context form; see {@link configureAppConfiguration} on the omitted no-context convenience.) */
  configureContainer<TContainerBuilder>(
    configureDelegate: Action<[HostBuilderContext, TContainerBuilder]>,
  ): this;

  /** Runs the configuration actions and produces an initialized {@link IHost}. */
  build(): IHost;
}
