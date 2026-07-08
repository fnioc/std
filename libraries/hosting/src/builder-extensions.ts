// IHostBuilder helpers -- ported from the reference hosting runtime's
// `HostingHostBuilderExtensions` static extension class. Authored as one named
// object literal per ME class (docs §28), `satisfies AugmentationSet<IHostBuilder>`.
// The `IHostBuilder` receiver interface is owned by hosting.core; the fluent
// method-form install (and the `declare module` merge) live in this package's
// `./host-augmentations` against the concrete `HostBuilder`. The members here are
// the standalone call surface.
//
// The synchronous reference wrappers (`RunConsoleAsync` blocks until shutdown)
// collapse into their async forms -- JS cannot block a thread.

import { MemoryConfigurationSource } from "@rhombus-std/config";
import { RESOLVER_TOKEN } from "@rhombus-std/di.core";
import type { Resolver } from "@rhombus-std/di.core";
import type { IMetricsBuilder } from "@rhombus-std/diagnostics.core";
import type {
  HostBuilderContext,
  IHostApplicationLifetime,
  IHostBuilder,
  IHostEnvironment,
} from "@rhombus-std/hosting.core";
import { HostDefaults, HostingAbstractionsHostExtensions } from "@rhombus-std/hosting.core";
import { HOST_APPLICATION_LIFETIME_TOKEN } from "@rhombus-std/hosting.core";
import { LOGGER_FACTORY_TOKEN, LoggingBuilder } from "@rhombus-std/logging";
import type { ILoggerFactory, ILoggingBuilder } from "@rhombus-std/logging.core";
import type { AugmentationSet } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";
import { ConsoleLifetime } from "./console-lifetime";
import { ConsoleLifetimeOptions } from "./console-lifetime-options";
import {
  addDefaultServices,
  applyDefaultAppConfiguration,
  applyDefaultHostConfiguration,
} from "./default-configuration";
import {
  CONSOLE_LIFETIME_OPTIONS_TOKEN,
  HOST_ENVIRONMENT_TOKEN,
  HOST_LIFETIME_TOKEN,
  HOST_OPTIONS_CONFIGURE_TOKEN,
} from "./framework-tokens";
import type { HostOptions } from "./host-options";
import { MetricsBuilder } from "./metrics-builder";

/**
 * A minimal service-provider-options shape. This repo's container has no
 * validate-scopes / validate-on-build toggles, so {@link useDefaultServiceProvider}
 * accepts this shape and no-ops -- see scaffoldedIncomplete.
 */
export interface ServiceProviderOptions {
  validateScopes?: boolean;
  validateOnBuild?: boolean;
}

/**
 * Configures an existing {@link IHostBuilder} with the pre-configured defaults:
 * content root = cwd, host config from prefixed env vars + args, app config from
 * `appsettings(.{env}).json` + env vars + args, and the console logging provider.
 */
function configureDefaults(hostBuilder: IHostBuilder, args?: readonly string[]): IHostBuilder {
  hostBuilder.configureHostConfiguration((configBuilder) => applyDefaultHostConfiguration(configBuilder, args));
  hostBuilder.configureAppConfiguration((context, configBuilder) =>
    applyDefaultAppConfiguration(configBuilder, context.hostingEnvironment, args)
  );
  hostBuilder.configureServices((_context, services) => addDefaultServices(services));
  return hostBuilder;
}

/** Specifies the environment. Call after {@link configureDefaults} to avoid being overwritten. */
function useEnvironment(hostBuilder: IHostBuilder, environment: string): IHostBuilder {
  return hostBuilder.configureHostConfiguration((configBuilder) => {
    configBuilder.add(
      new MemoryConfigurationSource({ initialData: { [HostDefaults.environmentKey]: environment } }),
    );
  });
}

/** Specifies the content root directory. Call after {@link configureDefaults} to avoid being overwritten. */
function useContentRoot(hostBuilder: IHostBuilder, contentRoot: string): IHostBuilder {
  return hostBuilder.configureHostConfiguration((configBuilder) => {
    configBuilder.add(
      new MemoryConfigurationSource({ initialData: { [HostDefaults.contentRootKey]: contentRoot } }),
    );
  });
}

/** Adds a delegate for configuring the {@link HostOptions} of the host. Additive across calls. */
function configureHostOptions(
  hostBuilder: IHostBuilder,
  configureOptions: Func<[HostBuilderContext, HostOptions], void>,
): IHostBuilder {
  return hostBuilder.configureServices((context, services) => {
    services.addValue(
      HOST_OPTIONS_CONFIGURE_TOKEN,
      (options: HostOptions) => configureOptions(context, options),
    );
  });
}

/** Adds a delegate for configuring the {@link ILoggingBuilder}. Additive across calls. */
function configureLogging(
  hostBuilder: IHostBuilder,
  configureLoggingDelegate: Func<[HostBuilderContext, ILoggingBuilder], void>,
): IHostBuilder {
  return hostBuilder.configureServices((context, services) => {
    configureLoggingDelegate(context, new LoggingBuilder(services));
  });
}

/** Adds a delegate for configuring the {@link IMetricsBuilder}. Additive across calls. */
function configureMetrics(
  hostBuilder: IHostBuilder,
  configureMetricsDelegate: Func<[HostBuilderContext, IMetricsBuilder], void>,
): IHostBuilder {
  return hostBuilder.configureServices((context, services) => {
    configureMetricsDelegate(context, new MetricsBuilder(services));
  });
}

/**
 * Specifies the default service-provider configuration. This repo's container
 * exposes no validation toggles, so the delegate runs against a throwaway
 * {@link ServiceProviderOptions} and the result is ignored -- see
 * scaffoldedIncomplete.
 */
function useDefaultServiceProvider(
  hostBuilder: IHostBuilder,
  configure: Func<[ServiceProviderOptions], void>,
): IHostBuilder {
  configure({});
  return hostBuilder;
}

/**
 * Listens for Ctrl+C / SIGTERM / SIGQUIT and requests a graceful shutdown by
 * registering the {@link ConsoleLifetime} as the host lifetime (overriding the
 * default {@link import("./null-lifetime").NullLifetime}).
 */
function useConsoleLifetime(
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
}

/**
 * Enables console support, builds and starts the host, and waits for Ctrl+C /
 * SIGTERM to shut down.
 */
function runConsoleAsync(
  hostBuilder: IHostBuilder,
  cancellationToken?: AbortSignal,
): Promise<void> {
  return HostingAbstractionsHostExtensions.runAsync(useConsoleLifetime(hostBuilder).build(), cancellationToken);
}

/**
 * The `HostingHostBuilderExtensions` augmentation set for {@link IHostBuilder}
 * (docs §28). Installed as instance methods onto the concrete `HostBuilder` via
 * `./host-augmentations`; the members here are the standalone call surface.
 */
export const HostingHostBuilderExtensions = {
  configureDefaults,
  useEnvironment,
  useContentRoot,
  configureHostOptions,
  configureLogging,
  configureMetrics,
  useDefaultServiceProvider,
  useConsoleLifetime,
  runConsoleAsync,
} satisfies AugmentationSet<IHostBuilder>;
