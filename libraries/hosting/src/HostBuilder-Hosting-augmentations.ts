// IHostBuilder helpers, authored as one named namespace.
//
// OPEN receiver: `IHostBuilder` is owned by hosting.core and extended across
// packages, so this namespace registers into the augmentation registry under
// the `IHostBuilder` type (alongside hosting.core's
// `HostBuilderStartAugmentations`, which contributes `startHost`). The
// interface-side merge for THIS namespace's members lives here beside it; the
// class-side merge onto the concrete `HostBuilder` (so it SATISFIES the
// fully-merged interface) stays in `./host-augmentations`, and the `HostBuilder`
// class itself is decorated with `@augment(typefor<IHostBuilder>())`.

// Type-only: puts di.extras' declare-module sugar faces in the program with
// no runtime import of the authoring package.
import type {} from '@rhombus-std/di.extras';

import { MemoryConfigSource } from '@rhombus-std/config';
import { ServiceProviderOptions } from '@rhombus-std/di';
import { ConstantType, type IServiceProvider } from '@rhombus-std/di.core';
import type { IMetricsBuilder } from '@rhombus-std/diagnostics.core';
import { type HostBuilderContext, HostDefaults, HostLifecycleAugmentations, type IHostApplicationLifetime, type IHostBuilder, type IHostEnvironment } from '@rhombus-std/hosting.core';
import { LoggingBuilder } from '@rhombus-std/logging';
import type { ILoggerFactory, ILoggingBuilder } from '@rhombus-std/logging.core';
import { type AbortSignal, Type } from '@rhombus-std/primitives';
import { registerAugmentations, typefor } from '@rhombus-std/primitives.extras';
import type { Func } from '@rhombus-toolkit/func';
import type { Flatten } from '@rhombus-toolkit/type-helpers';
import { ConsoleLifetimeOptions } from './ConsoleLifetimeOptions';
import { addDefaultServices, applyDefaultAppConfig, applyDefaultHostConfig, createDefaultServiceProviderOptions } from './default-config';
import { HOST_LIFETIME_TYPE, HOST_OPTIONS_CONFIGURE_TYPE } from './framework-types';
import type { HostOptions } from './HostOptions';
import { ConsoleLifetime } from './internal/ConsoleLifetime';
import { MetricsBuilder } from './MetricsBuilder';
import { setServiceProviderOptionsFactory } from './ServiceProviderOptionsFactory';

/**
 * Registered under the `IHostBuilder` type; the concrete `HostBuilder` pulls it
 * (and hosting.core's `startHost`) via `@augment`. The members here are also the
 * standalone call surface.
 */
export namespace HostBuilderHostingAugmentations {
  /**
   * Configures an existing {@link IHostBuilder} with the pre-configured defaults:
   * content root = cwd, host config from prefixed env vars + args, app config from
   * `appsettings(.{env}).json` + env vars + args, and the console logging provider.
   */
  export function configureDefaults<Self extends IHostBuilder>(this: Self, args?: readonly string[]): Self {
    this.configureHostConfig((configBuilder) => applyDefaultHostConfig(configBuilder, args));
    this.configureAppConfig((context, configBuilder) => applyDefaultAppConfig(configBuilder, context.hostingEnvironment, args));
    this.configureServices((_context, services) => addDefaultServices(services));
    // The single-container `build()` reads the service-provider options from a
    // side channel; the factory computes them at build time, once the hosting
    // environment is resolved.
    setServiceProviderOptionsFactory(this, (context) => createDefaultServiceProviderOptions(context.hostingEnvironment));
    return this;
  }

  /** Specifies the environment. Call after {@link configureDefaults} to avoid being overwritten. */
  export function useEnvironment<Self extends IHostBuilder>(this: Self, environment: string): Self {
    return this.configureHostConfig((configBuilder) => {
      configBuilder.add(new MemoryConfigSource({ initialData: { [HostDefaults.environmentKey]: environment } }));
    });
  }

  /** Specifies the content root directory. Call after {@link configureDefaults} to avoid being overwritten. */
  export function useContentRoot<Self extends IHostBuilder>(this: Self, contentRoot: string): Self {
    return this.configureHostConfig((configBuilder) => {
      configBuilder.add(new MemoryConfigSource({ initialData: { [HostDefaults.contentRootKey]: contentRoot } }));
    });
  }

  /**
   * Adds a delegate for configuring the {@link HostOptions} of the host. Additive
   * across calls. The no-context form (a one-parameter delegate) is a
   * convenience overload; the two are told apart by declared arity.
   */
  export function configureHostOptions<Self extends IHostBuilder>(this: Self, configureOptions: Func<[HostOptions], void>): Self;
  export function configureHostOptions<Self extends IHostBuilder>(this: Self, configureOptions: Func<[HostBuilderContext, HostOptions], void>): Self;
  export function configureHostOptions<Self extends IHostBuilder>(this: Self, configureOptions: Func<[HostBuilderContext, HostOptions], void> | Func<[HostOptions], void>): Self {
    return this.configureServices((context, services) =>
      services.add(HOST_OPTIONS_CONFIGURE_TYPE, (options: HostOptions) => {
        if (configureOptions.length >= 2) {
          (configureOptions as Func<[HostBuilderContext, HostOptions], void>)(context, options);
        } else {
          (configureOptions as Func<[HostOptions], void>)(options);
        }
      }, ConstantType)
    );
  }

  /**
   * Adds a delegate for configuring the {@link ILoggingBuilder}. Additive across
   * calls. The one-parameter no-context form is a convenience overload,
   * distinguished by declared arity.
   */
  export function configureLogging<Self extends IHostBuilder>(this: Self, configureLoggingDelegate: Func<[ILoggingBuilder], void>): Self;
  export function configureLogging<Self extends IHostBuilder>(this: Self, configureLoggingDelegate: Func<[HostBuilderContext, ILoggingBuilder], void>): Self;
  export function configureLogging<Self extends IHostBuilder>(this: Self, configureLoggingDelegate: Func<[HostBuilderContext, ILoggingBuilder], void> | Func<[ILoggingBuilder], void>): Self {
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
  }

  /**
   * Adds a delegate for configuring the {@link IMetricsBuilder}. Additive across
   * calls. The one-parameter no-context form is a convenience overload,
   * distinguished by declared arity.
   */
  export function configureMetrics<Self extends IHostBuilder>(this: Self, configureMetricsDelegate: Func<[IMetricsBuilder], void>): Self;
  export function configureMetrics<Self extends IHostBuilder>(this: Self, configureMetricsDelegate: Func<[HostBuilderContext, IMetricsBuilder], void>): Self;
  export function configureMetrics<Self extends IHostBuilder>(this: Self, configureMetricsDelegate: Func<[HostBuilderContext, IMetricsBuilder], void> | Func<[IMetricsBuilder], void>): Self {
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
  }

  /**
   * Specifies the default service-provider configuration. The delegate receives
   * {@link ServiceProviderOptions.defaults} and returns the
   * {@link ServiceProviderOptions} (`validateScopes` / `validateOnBuild`)
   * that `build()` then threads into
   * `ServiceManifest.build(options)`. Overrides any options set by an earlier
   * `configureDefaults`.
   */
  export function useDefaultServiceProvider<Self extends IHostBuilder>(this: Self, configure: Func<[ServiceProviderOptions], ServiceProviderOptions>): Self {
    const options = configure(ServiceProviderOptions.defaults);
    setServiceProviderOptionsFactory(this, () => options);
    return this;
  }

  /**
   * Listens for Ctrl+C / SIGTERM / SIGQUIT and requests a graceful shutdown by
   * registering the {@link ConsoleLifetime} as the host lifetime (overriding the
   * default {@link import("./internal/NullLifetime").NullLifetime}).
   */
  export function useConsoleLifetime<Self extends IHostBuilder>(this: Self, configureOptions?: Func<[ConsoleLifetimeOptions], void>): Self {
    const options = new ConsoleLifetimeOptions();
    configureOptions?.(options);
    return this.configureServices((_context, services) => {
      const withOptions = services.addValue<ConsoleLifetimeOptions>(options);
      return withOptions.add(HOST_LIFETIME_TYPE,
        (resolver: IServiceProvider) =>
          new ConsoleLifetime(resolver.getRequiredService<ConsoleLifetimeOptions>(), resolver.getRequiredService<IHostEnvironment>(), resolver.getRequiredService<IHostApplicationLifetime>(),
            resolver.getRequiredService<ILoggerFactory>()), Type.func(HOST_LIFETIME_TYPE, [[typefor<IServiceProvider>()]]));
    });
  }

  /**
   * Enables console support, builds and starts the host, and waits for Ctrl+C /
   * SIGTERM to shut down. The optional leading delegate configures the
   * {@link ConsoleLifetimeOptions} before the console lifetime is registered;
   * the two forms are told apart by whether the first argument is a function.
   */
  export function runConsoleAsync(this: IHostBuilder, abortSignal?: AbortSignal): Promise<void>;
  export function runConsoleAsync(this: IHostBuilder, configureOptions: Func<[ConsoleLifetimeOptions], void>, abortSignal?: AbortSignal): Promise<void>;
  export function runConsoleAsync(this: IHostBuilder, configureOptionsOrAbortSignal?: Func<[ConsoleLifetimeOptions], void> | AbortSignal, maybeAbortSignal?: AbortSignal): Promise<void> {
    let configureOptions: Func<[ConsoleLifetimeOptions], void> | undefined;
    let abortSignal: AbortSignal | undefined;
    if (typeof configureOptionsOrAbortSignal === 'function') {
      configureOptions = configureOptionsOrAbortSignal;
      abortSignal = maybeAbortSignal;
    } else {
      abortSignal = configureOptionsOrAbortSignal;
    }
    return HostLifecycleAugmentations.runAsync.call(
      HostBuilderHostingAugmentations.useConsoleLifetime.call(this, configureOptions).build(),
      abortSignal,
    );
  }
}

// The interface-side merge for this namespace's members lives HERE beside it: a
// consumer holding `IHostBuilder` sees the method form. hosting.core
// contributes `startHost` onto the same interface from its own namespace file. The
// concrete `HostBuilder` (and `HostBuilderAdapter`) satisfy the fully-merged
// interface via their own `interface ... extends IHostBuilder` merge beside each
// class -- no class-side member restatement.
//
// The merge targets the package BARREL (`@rhombus-std/hosting.core`), matching
// hosting.core's own `startHost` merge, so a published consumer of
// `@rhombus-std/hosting` sees every member below.
declare module '@rhombus-std/hosting.core' {
  interface IHostBuilder extends Flatten<typeof HostBuilderHostingAugmentations> {}
}

registerAugmentations<IHostBuilder>(HostBuilderHostingAugmentations);
