// IHostBuilder helpers -- ported from the reference hosting runtime's
// `HostingHostBuilderExtensions`. `IHostBuilder` is an interface the hosting
// family owns (hosting.core) with no concrete class here to prototype-patch, so
// per the repo convention these surface as plain functions taking the builder
// first (mirroring hosting.core's own `startHost` / the logging builder
// extensions), not fluent augmentations.
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
import { HostDefaults, runAsync } from "@rhombus-std/hosting.core";
import { HOST_APPLICATION_LIFETIME_TOKEN } from "@rhombus-std/hosting.core";
import { LOGGER_FACTORY_TOKEN, LoggingBuilder } from "@rhombus-std/logging";
import type { ILoggerFactory, ILoggingBuilder } from "@rhombus-std/logging.core";
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
export function configureDefaults(hostBuilder: IHostBuilder, args?: readonly string[]): IHostBuilder {
  hostBuilder.configureHostConfiguration((configBuilder) => applyDefaultHostConfiguration(configBuilder, args));
  hostBuilder.configureAppConfiguration((context, configBuilder) =>
    applyDefaultAppConfiguration(configBuilder, context.hostingEnvironment, args)
  );
  hostBuilder.configureServices((_context, services) => addDefaultServices(services));
  return hostBuilder;
}

/** Specifies the environment. Call after {@link configureDefaults} to avoid being overwritten. */
export function useEnvironment(hostBuilder: IHostBuilder, environment: string): IHostBuilder {
  return hostBuilder.configureHostConfiguration((configBuilder) => {
    configBuilder.add(
      new MemoryConfigurationSource({ initialData: { [HostDefaults.environmentKey]: environment } }),
    );
  });
}

/** Specifies the content root directory. Call after {@link configureDefaults} to avoid being overwritten. */
export function useContentRoot(hostBuilder: IHostBuilder, contentRoot: string): IHostBuilder {
  return hostBuilder.configureHostConfiguration((configBuilder) => {
    configBuilder.add(
      new MemoryConfigurationSource({ initialData: { [HostDefaults.contentRootKey]: contentRoot } }),
    );
  });
}

/** Adds a delegate for configuring the {@link HostOptions} of the host. Additive across calls. */
export function configureHostOptions(
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
export function configureLogging(
  hostBuilder: IHostBuilder,
  configureLoggingDelegate: Func<[HostBuilderContext, ILoggingBuilder], void>,
): IHostBuilder {
  return hostBuilder.configureServices((context, services) => {
    configureLoggingDelegate(context, new LoggingBuilder(services));
  });
}

/** Adds a delegate for configuring the {@link IMetricsBuilder}. Additive across calls. */
export function configureMetrics(
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
export function useDefaultServiceProvider(
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
export function useConsoleLifetime(
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
export function runConsoleAsync(
  hostBuilder: IHostBuilder,
  cancellationToken?: AbortSignal,
): Promise<void> {
  return runAsync(useConsoleLifetime(hostBuilder).build(), cancellationToken);
}
