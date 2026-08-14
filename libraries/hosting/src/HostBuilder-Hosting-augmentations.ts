// IHostBuilder helpers, authored as one named object literal.
//
// OPEN receiver: `IHostBuilder` is owned by hosting.core and extended across
// packages, so this const registers into the augmentation registry under
// the `IHostBuilder` token (alongside hosting.core's
// `HostBuilderStartAugmentations`, which contributes `startHost`). The
// interface-side merge for THIS const's members lives here beside it; the
// class-side merge onto the concrete `HostBuilder` (so it SATISFIES the
// fully-merged interface) stays in `./host-augmentations`, and the `HostBuilder`
// class itself is decorated with `@augment(typefor<IHostBuilder>())`.

import { MemoryConfigSource } from '@rhombus-std/config';
import { ServiceProviderOptions } from '@rhombus-std/di';
import { type IServiceProvider, RESOLVER_TYPE } from '@rhombus-std/di.core';
import type { IMetricsBuilder } from '@rhombus-std/diagnostics.core';
import { HOST_APPLICATION_LIFETIME_TYPE, type HostBuilderContext, HostDefaults, HostLifecycleAugmentations,
  type IHostBuilder } from '@rhombus-std/hosting.core';
import { LOGGER_FACTORY_TYPE, LoggingBuilder } from '@rhombus-std/logging';
import type { ILoggingBuilder } from '@rhombus-std/logging.core';
import { type AbortSignal, type AugmentationSet2, type Flatten, Type } from '@rhombus-std/primitives';
import { registerAugmentations } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import { ConsoleLifetimeOptions } from './ConsoleLifetimeOptions';
import { addDefaultServices, applyDefaultAppConfig, applyDefaultHostConfig,
  createDefaultServiceProviderOptions } from './default-config';
import { CONSOLE_LIFETIME_OPTIONS_TYPE, HOST_ENVIRONMENT_TYPE, HOST_LIFETIME_TYPE,
  HOST_OPTIONS_CONFIGURE_TYPE } from './framework-types';
import type { HostOptions } from './HostOptions';
import { ConsoleLifetime } from './internal/ConsoleLifetime';
import { MetricsBuilder } from './MetricsBuilder';
import { setServiceProviderOptionsFactory } from './ServiceProviderOptionsFactory';

// The interface-side merge for this const's members lives HERE beside the
// const: a consumer holding `IHostBuilder` sees the method form. hosting.core
// contributes `startHost` onto the same interface from its own const file. The
// concrete `HostBuilder` (and `HostBuilderAdapter`) satisfy the fully-merged
// interface via their own `interface ... extends IHostBuilder` merge beside each
// class — no class-side member restatement.
//
// The merge targets the package BARREL (`@rhombus-std/hosting.core`), matching
// hosting.core's own `startHost` merge, so a published consumer of
// `@rhombus-std/hosting` sees every member below.
interface IHostBuilderHostingAugmentations {
  configureDefaults(args?: readonly string[]): this;
  useEnvironment(environment: string): this;
  useContentRoot(contentRoot: string): this;
  // No-context overloads listed first so an un-annotated one-parameter lambda
  // resolves to them (TS picks the earliest compatible overload).
  configureHostOptions(configureOptions: Func<[HostOptions], void>): this;
  configureHostOptions(configureOptions: Func<[HostBuilderContext, HostOptions], void>): this;
  configureLogging(configureLoggingDelegate: Func<[ILoggingBuilder], void>): this;
  configureLogging(configureLoggingDelegate: Func<[HostBuilderContext, ILoggingBuilder], void>): this;
  configureMetrics(configureMetricsDelegate: Func<[IMetricsBuilder], void>): this;
  configureMetrics(configureMetricsDelegate: Func<[HostBuilderContext, IMetricsBuilder], void>): this;
  useDefaultServiceProvider(configure: Func<[ServiceProviderOptions], ServiceProviderOptions>): this;
  useConsoleLifetime(configureOptions?: Func<[ConsoleLifetimeOptions], void>): this;
  runConsoleAsync(abortSignal?: AbortSignal): Promise<void>;
  runConsoleAsync(configureOptions: Func<[ConsoleLifetimeOptions], void>, abortSignal?: AbortSignal): Promise<void>;
}

declare module '@rhombus-std/hosting.core' {
  interface IHostBuilder extends IHostBuilderHostingAugmentations {}
}

/**
 * Registered under the `IHostBuilder` token; the concrete `HostBuilder` pulls it
 * (and hosting.core's `startHost`) via `@augment`. The members here are also the
 * standalone call surface.
 */
export const HostBuilderHostingAugmentations: AugmentationSet2<IHostBuilder,
  Flatten<IHostBuilderHostingAugmentations>> = {
    /**
     * Configures an existing {@link IHostBuilder} with the pre-configured defaults:
     * content root = cwd, host config from prefixed env vars + args, app config from
     * `appsettings(.{env}).json` + env vars + args, and the console logging provider.
     */
    configureDefaults(args?: readonly string[]): IHostBuilder {
      this.configureHostConfig((configBuilder) => applyDefaultHostConfig(configBuilder, args));
      this.configureAppConfig((context, configBuilder) =>
        applyDefaultAppConfig(configBuilder, context.hostingEnvironment, args)
      );
      this.configureServices((_context, services) => addDefaultServices(services));
      // The single-container `build()` reads the service-provider options from a
      // side channel; the factory computes them at build time, once the hosting
      // environment is resolved.
      setServiceProviderOptionsFactory(this,
        (context) => createDefaultServiceProviderOptions(context.hostingEnvironment));
      return this;
    },

    /** Specifies the environment. Call after {@link configureDefaults} to avoid being overwritten. */
    useEnvironment(environment: string): IHostBuilder {
      return this.configureHostConfig((configBuilder) => {
        configBuilder.add(new MemoryConfigSource({ initialData: { [HostDefaults.environmentKey]: environment } }));
      });
    },

    /** Specifies the content root directory. Call after {@link configureDefaults} to avoid being overwritten. */
    useContentRoot(contentRoot: string): IHostBuilder {
      return this.configureHostConfig((configBuilder) => {
        configBuilder.add(new MemoryConfigSource({ initialData: { [HostDefaults.contentRootKey]: contentRoot } }));
      });
    },

    /**
     * Adds a delegate for configuring the {@link HostOptions} of the host. Additive
     * across calls. The no-context form (a one-parameter delegate) is a
     * convenience overload; the two are told apart by declared arity.
     */
    configureHostOptions(
      configureOptions: Func<[HostBuilderContext, HostOptions], void> | Func<[HostOptions], void>,
    ): IHostBuilder {
      return this.configureServices((context, services) =>
        services.addValue(HOST_OPTIONS_CONFIGURE_TYPE, (options: HostOptions) => {
          if (configureOptions.length >= 2) {
            (configureOptions as Func<[HostBuilderContext, HostOptions], void>)(context, options);
          } else {
            (configureOptions as Func<[HostOptions], void>)(options);
          }
        })
      );
    },

    /**
     * Adds a delegate for configuring the {@link ILoggingBuilder}. Additive across
     * calls. The one-parameter no-context form is a convenience overload,
     * distinguished by declared arity.
     */
    configureLogging(
      configureLoggingDelegate: Func<[HostBuilderContext, ILoggingBuilder], void> | Func<[ILoggingBuilder], void>,
    ): IHostBuilder {
      return this.configureServices((context, services) => {
        const builder = new LoggingBuilder(services);
        if (configureLoggingDelegate.length >= 2) {
          (configureLoggingDelegate as Func<[HostBuilderContext, ILoggingBuilder], void>)(context, builder);
        } else {
          (configureLoggingDelegate as Func<[ILoggingBuilder], void>)(builder);
        }
        // The builder holds whatever the delegate registered -- the chain is
        // immutable, so `services` itself is unchanged.
        return builder.services;
      });
    },

    /**
     * Adds a delegate for configuring the {@link IMetricsBuilder}. Additive across
     * calls. The one-parameter no-context form is a convenience overload,
     * distinguished by declared arity.
     */
    configureMetrics(
      configureMetricsDelegate: Func<[HostBuilderContext, IMetricsBuilder], void> | Func<[IMetricsBuilder], void>,
    ): IHostBuilder {
      return this.configureServices((context, services) => {
        const builder = new MetricsBuilder(services);
        if (configureMetricsDelegate.length >= 2) {
          (configureMetricsDelegate as Func<[HostBuilderContext, IMetricsBuilder], void>)(context, builder);
        } else {
          (configureMetricsDelegate as Func<[IMetricsBuilder], void>)(builder);
        }
        // The builder holds whatever the delegate registered -- the chain is
        // immutable, so `services` itself is unchanged.
        return builder.services;
      });
    },

    /**
     * Specifies the default service-provider configuration. The delegate receives
     * {@link ServiceProviderOptions.defaults} and returns the
     * {@link ServiceProviderOptions} (`validateScopes` / `validateOnBuild` /
     * `unionAmbiguity`) that `build()` then threads into
     * `ServiceManifest.build(options)`. Overrides any options set by an earlier
     * `configureDefaults`.
     */
    useDefaultServiceProvider(
      configure: Func<[ServiceProviderOptions], ServiceProviderOptions>,
    ): IHostBuilder {
      const options = configure(ServiceProviderOptions.defaults);
      setServiceProviderOptionsFactory(this, () => options);
      return this;
    },

    /**
     * Listens for Ctrl+C / SIGTERM / SIGQUIT and requests a graceful shutdown by
     * registering the {@link ConsoleLifetime} as the host lifetime (overriding the
     * default {@link import("./internal/NullLifetime").NullLifetime}).
     */
    useConsoleLifetime(
      configureOptions?: Func<[ConsoleLifetimeOptions], void>,
    ): IHostBuilder {
      const options = new ConsoleLifetimeOptions();
      configureOptions?.(options);
      return this.configureServices((_context, services) => {
        const withOptions = services.addValue(CONSOLE_LIFETIME_OPTIONS_TYPE, options);
        return withOptions.addFactory(HOST_LIFETIME_TYPE,
          (resolver: IServiceProvider) =>
            new ConsoleLifetime(resolver.getRequiredService(CONSOLE_LIFETIME_OPTIONS_TYPE),
              resolver.getRequiredService(HOST_ENVIRONMENT_TYPE),
              resolver.getRequiredService(HOST_APPLICATION_LIFETIME_TYPE),
              resolver.getRequiredService(LOGGER_FACTORY_TYPE)), Type.func(HOST_LIFETIME_TYPE, [[RESOLVER_TYPE]]));
      });
    },

    /**
     * Enables console support, builds and starts the host, and waits for Ctrl+C /
     * SIGTERM to shut down. The optional leading delegate configures the
     * {@link ConsoleLifetimeOptions} before the console lifetime is registered;
     * the two forms are told apart by whether the first argument is a function.
     */
    runConsoleAsync(
      ...args: [abortSignal?: AbortSignal] | [configureOptions: Func<[ConsoleLifetimeOptions], void>,
        abortSignal?: AbortSignal]
    ): Promise<void> {
      let configureOptions: Func<[ConsoleLifetimeOptions], void> | undefined;
      let abortSignal: AbortSignal | undefined;
      if (typeof args[0] === 'function') {
        configureOptions = args[0];
        abortSignal = args[1];
      } else {
        abortSignal = args[0];
      }
      return HostLifecycleAugmentations.runAsync.call(
        HostBuilderHostingAugmentations.useConsoleLifetime.call(this, configureOptions).build(),
        abortSignal,
      );
    },
  };

registerAugmentations<IHostBuilder>(HostBuilderHostingAugmentations);
