import type { IConfigBuilder } from '@rhombus-std/config.core';
import type { Manifest } from '@rhombus-std/di.core';
import type { Action, Func } from '@rhombus-toolkit/func';
import type { HostBuilderContext } from './HostBuilderContext';
import type { IHost } from './IHost';

/**
 * A program initialization abstraction. The primary API surface for assembling
 * a host: configuration wiring (`@rhombus-std/config`) and service registration
 * (`@rhombus-std/di`'s {@link Manifest}) are threaded through the
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
  configureHostConfig(configureDelegate: Action<[IConfigBuilder]>): this;

  /**
   * Sets up the configuration for the remainder of the build and the
   * application. Additive across calls; results are exposed at
   * {@link HostBuilderContext.config} and in {@link IHost.services}.
   *
   * @remarks
   * There is no no-context overload: a TS overload on this method can't
   * distinguish an unannotated context-less lambda from the context-taking
   * form without degrading the dominant form's contextual typing. A caller
   * that doesn't need the context writes the two-parameter form with an
   * unused first parameter.
   */
  configureAppConfig(configureDelegate: Action<[HostBuilderContext, IConfigBuilder]>): this;

  /**
   * Adds services to the container. Additive across calls. (Context form;
   * see {@link configureAppConfig} for the no-context remark.)
   *
   * @remarks
   * The delegate returns the manifest rather than mutating one — the chain
   * is immutable, so every registration hands back a new manifest and the
   * builder threads the delegate's return value into the next step. A
   * delegate that registers something and returns the manifest it was given
   * would silently drop that registration.
   */
  configureServices(configureDelegate: Func<[HostBuilderContext, Manifest<any>], Manifest<any>>): this;

  /**
   * Enables configuring the instantiated dependency container. Additive
   * across calls. (Context form; see {@link configureAppConfig} for the
   * no-context remark.) `TContainerBuilder` is always the {@link Manifest} this
   * host builds, so the delegate returns it for the same immutability reason
   * {@link configureServices} does.
   */
  configureContainer(configureDelegate: Func<[HostBuilderContext, Manifest<any>], Manifest<any>>): this;

  /** Runs the configuration actions and produces an initialized {@link IHost}. */
  build(): IHost;
}
