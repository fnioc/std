// IHostBuilder helpers -- ported from the reference hosting runtime's
// `HostingHostBuilderExtensions` static augmentation class. Authored as one named
// object literal per ME class (docs §28), `satisfies AugmentationSet<IHostBuilder>`.
//
// OPEN receiver (docs §38): `IHostBuilder` is owned by hosting.core and extended
// across packages, so this const registers into the augmentation registry under
// the `IHostBuilder` token (alongside hosting.core's
// `HostingAbstractionsHostBuilderExtensions`, which contributes `startHost`). The
// interface-side merge for THIS const's members lives here beside it (rule 0.6);
// the class-side merge onto the concrete `HostBuilder` (so it SATISFIES the
// fully-merged interface) stays in `./host-augmentations`, and the `HostBuilder`
// class itself is decorated with `@augment(nameof<IHostBuilder>())`.
//
// The synchronous reference wrappers (`RunConsoleAsync` blocks until shutdown)
// collapse into their async forms -- JS cannot block a thread.

import { MemoryConfigurationSource } from "@rhombus-std/config";
import { type Resolver, RESOLVER_TOKEN, type ServiceProviderOptions } from "@rhombus-std/di.core";
import type { IMetricsBuilder } from "@rhombus-std/diagnostics.core";
import {
  HOST_APPLICATION_LIFETIME_TOKEN,
  type HostBuilderContext,
  HostDefaults,
  HostingAbstractionsHostExtensions,
  type IHostApplicationLifetime,
  type IHostBuilder,
  type IHostEnvironment,
} from "@rhombus-std/hosting.core";
import { LOGGER_FACTORY_TOKEN, LoggingBuilder } from "@rhombus-std/logging";
import type { ILoggerFactory, ILoggingBuilder } from "@rhombus-std/logging.core";
import { type AbortSignal, type AugmentationSet, registerAugmentations } from "@rhombus-std/primitives";
import { nameof } from "@rhombus-std/primitives.transformer/internal/nameof";
import type { Func } from "@rhombus-toolkit/func";
import { ConsoleLifetimeOptions } from "./ConsoleLifetimeOptions";
import {
  addDefaultServices,
  applyDefaultAppConfiguration,
  applyDefaultHostConfiguration,
  createDefaultServiceProviderOptions,
} from "./default-configuration";
import {
  CONSOLE_LIFETIME_OPTIONS_TOKEN,
  HOST_ENVIRONMENT_TOKEN,
  HOST_LIFETIME_TOKEN,
  HOST_OPTIONS_CONFIGURE_TOKEN,
} from "./framework-tokens";
import type { HostOptions } from "./HostOptions";
import { ConsoleLifetime } from "./Internal/console-lifetime";
import { MetricsBuilder } from "./MetricsBuilder";
import { setServiceProviderOptionsFactory } from "./service-provider-options-store";

// The interface-side merge for this const's members lives HERE beside the const
// (rule 0.6): a consumer holding `IHostBuilder` sees the method form. hosting.core
// contributes `startHost` onto the same interface from its own const file; the
// class-side merge (so `HostBuilder` SATISFIES the fully-merged interface) lives
// in `./host-augmentations` next to the class.
//
// The merge targets the package BARREL (`@rhombus-std/hosting.core`), matching
// hosting.core's own `startHost` merge. A cross-package merge is kept verbatim in
// the rolled `.d.ts` (rollup-dts `respectExternal`), so it only reaches a
// published consumer if the specifier survives publish -- the `internal/*`
// subpath this used to target is scrubbed at publish time (docs §7), so consumers
// of `@rhombus-std/hosting` silently lost every member below. The barrel is
// publish-resolvable and, being shared with hosting.core's merge, keeps every
// site for this interface on one module file (the §38 merge-identity rule), so
// the concrete `HostBuilder` still satisfies `implements IHostBuilder`.
declare module "@rhombus-std/hosting.core" {
  interface IHostBuilder {
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
    useDefaultServiceProvider(configure: Func<[ServiceProviderOptions], void>): this;
    useConsoleLifetime(configureOptions?: Func<[ConsoleLifetimeOptions], void>): this;
    runConsoleAsync(abortSignal?: AbortSignal): Promise<void>;
  }
}

/**
 * The `HostingHostBuilderExtensions` augmentation set for {@link IHostBuilder}
 * (docs §28). Registered under the `IHostBuilder` token; the
 * concrete `HostBuilder` pulls it (and hosting.core's `startHost`) via `@augment`.
 * The members here are also the standalone call surface.
 */
export const HostingHostBuilderExtensions = {
  /**
   * Configures an existing {@link IHostBuilder} with the pre-configured defaults:
   * content root = cwd, host config from prefixed env vars + args, app config from
   * `appsettings(.{env}).json` + env vars + args, and the console logging provider.
   */
  configureDefaults(hostBuilder: IHostBuilder, args?: readonly string[]): IHostBuilder {
    hostBuilder.configureHostConfiguration((configBuilder) => applyDefaultHostConfiguration(configBuilder, args));
    hostBuilder.configureAppConfiguration((context, configBuilder) =>
      applyDefaultAppConfiguration(configBuilder, context.hostingEnvironment, args)
    );
    hostBuilder.configureServices((_context, services) => addDefaultServices(services));
    // The reference finishes with a default service-provider factory carrying the
    // dev-environment validation options. Here the single-container `build()`
    // reads them from the side channel instead (docs §24); the factory computes
    // them at build time, once the hosting environment is resolved.
    setServiceProviderOptionsFactory(
      hostBuilder,
      (context) => createDefaultServiceProviderOptions(context.hostingEnvironment),
    );
    return hostBuilder;
  },

  /** Specifies the environment. Call after {@link configureDefaults} to avoid being overwritten. */
  useEnvironment(hostBuilder: IHostBuilder, environment: string): IHostBuilder {
    return hostBuilder.configureHostConfiguration((configBuilder) => {
      configBuilder.add(
        new MemoryConfigurationSource({ initialData: { [HostDefaults.environmentKey]: environment } }),
      );
    });
  },

  /** Specifies the content root directory. Call after {@link configureDefaults} to avoid being overwritten. */
  useContentRoot(hostBuilder: IHostBuilder, contentRoot: string): IHostBuilder {
    return hostBuilder.configureHostConfiguration((configBuilder) => {
      configBuilder.add(
        new MemoryConfigurationSource({ initialData: { [HostDefaults.contentRootKey]: contentRoot } }),
      );
    });
  },

  /**
   * Adds a delegate for configuring the {@link HostOptions} of the host. Additive
   * across calls. The no-context form (a one-parameter delegate) is the
   * reference's convenience overload; the two are told apart by declared arity.
   */
  configureHostOptions(
    hostBuilder: IHostBuilder,
    configureOptions: Func<[HostBuilderContext, HostOptions], void> | Func<[HostOptions], void>,
  ): IHostBuilder {
    return hostBuilder.configureServices((context, services) => {
      services.addValue(
        HOST_OPTIONS_CONFIGURE_TOKEN,
        (options: HostOptions) => {
          if (configureOptions.length >= 2) {
            (configureOptions as Func<[HostBuilderContext, HostOptions], void>)(context, options);
          } else {
            (configureOptions as Func<[HostOptions], void>)(options);
          }
        },
      );
    });
  },

  /**
   * Adds a delegate for configuring the {@link ILoggingBuilder}. Additive across
   * calls. The one-parameter no-context form is the reference's convenience
   * overload, distinguished by declared arity.
   */
  configureLogging(
    hostBuilder: IHostBuilder,
    configureLoggingDelegate: Func<[HostBuilderContext, ILoggingBuilder], void> | Func<[ILoggingBuilder], void>,
  ): IHostBuilder {
    return hostBuilder.configureServices((context, services) => {
      const builder = new LoggingBuilder(services);
      if (configureLoggingDelegate.length >= 2) {
        (configureLoggingDelegate as Func<[HostBuilderContext, ILoggingBuilder], void>)(context, builder);
      } else {
        (configureLoggingDelegate as Func<[ILoggingBuilder], void>)(builder);
      }
    });
  },

  /**
   * Adds a delegate for configuring the {@link IMetricsBuilder}. Additive across
   * calls. The one-parameter no-context form is the reference's convenience
   * overload, distinguished by declared arity.
   */
  configureMetrics(
    hostBuilder: IHostBuilder,
    configureMetricsDelegate: Func<[HostBuilderContext, IMetricsBuilder], void> | Func<[IMetricsBuilder], void>,
  ): IHostBuilder {
    return hostBuilder.configureServices((context, services) => {
      const builder = new MetricsBuilder(services);
      if (configureMetricsDelegate.length >= 2) {
        (configureMetricsDelegate as Func<[HostBuilderContext, IMetricsBuilder], void>)(context, builder);
      } else {
        (configureMetricsDelegate as Func<[IMetricsBuilder], void>)(builder);
      }
    });
  },

  /**
   * Specifies the default service-provider configuration — the reference
   * `UseDefaultServiceProvider`. The delegate configures a fresh
   * {@link ServiceProviderOptions} (`validateScopes` / `validateOnBuild`) that
   * `build()` then threads into `ServiceManifest.build(options)`. Overrides any
   * options set by an earlier `configureDefaults`.
   */
  useDefaultServiceProvider(
    hostBuilder: IHostBuilder,
    configure: Func<[ServiceProviderOptions], void>,
  ): IHostBuilder {
    const options: ServiceProviderOptions = {};
    configure(options);
    setServiceProviderOptionsFactory(hostBuilder, () => options);
    return hostBuilder;
  },

  /**
   * Listens for Ctrl+C / SIGTERM / SIGQUIT and requests a graceful shutdown by
   * registering the {@link ConsoleLifetime} as the host lifetime (overriding the
   * default {@link import("./Internal/NullLifetime").NullLifetime}).
   */
  useConsoleLifetime(
    hostBuilder: IHostBuilder,
    configureOptions?: Func<[ConsoleLifetimeOptions], void>,
  ): IHostBuilder {
    const options = new ConsoleLifetimeOptions();
    configureOptions?.(options);
    return hostBuilder.configureServices((_context, services) => {
      services.addValue(CONSOLE_LIFETIME_OPTIONS_TOKEN, options);
      services.addFactory(
        HOST_LIFETIME_TOKEN,
        (resolver: Resolver) =>
          new ConsoleLifetime(
            resolver.resolve<ConsoleLifetimeOptions>(CONSOLE_LIFETIME_OPTIONS_TOKEN),
            resolver.resolve<IHostEnvironment>(HOST_ENVIRONMENT_TOKEN),
            resolver.resolve<IHostApplicationLifetime>(HOST_APPLICATION_LIFETIME_TOKEN),
            resolver.resolve<ILoggerFactory>(LOGGER_FACTORY_TOKEN),
          ),
        [[RESOLVER_TOKEN]],
      );
    });
  },

  /**
   * Enables console support, builds and starts the host, and waits for Ctrl+C /
   * SIGTERM to shut down.
   */
  runConsoleAsync(
    hostBuilder: IHostBuilder,
    abortSignal?: AbortSignal,
  ): Promise<void> {
    return HostingAbstractionsHostExtensions.runAsync(
      HostingHostBuilderExtensions.useConsoleLifetime(hostBuilder).build(),
      abortSignal,
    );
  },
} satisfies AugmentationSet<IHostBuilder>;

registerAugmentations(nameof<IHostBuilder>(), HostingHostBuilderExtensions);
