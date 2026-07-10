// Shared host-composition tail for both builders -- the port of the reference
// runtime's `HostBuilder.PopulateServiceCollection` + `HostBuilder.ResolveHost`,
// factored out so the classic `HostBuilder` and the modern
// `HostApplicationBuilder` compose identically.
//
// Two seams differ from the reference because this repo constructs the internal
// `Host` with its dependencies passed DIRECTLY (ctor args), not resolved from
// the container:
//   - The framework singletons (`ApplicationLifetime`, the `LoggerFactory`, the
//     resolved `HostOptions`) are constructed eagerly and registered as VALUES,
//     so `IHost.services` hands the SAME instance back to a consumer that
//     resolves them (a `.as("singleton")` registration would resolve
//     transiently off the frameless root -- decisions.md; the frameless-provider
//     gotcha). This is what keeps `waitForShutdownAsync`'s
//     `resolve(HOST_APPLICATION_LIFETIME_TOKEN)` returning the very lifetime the
//     host drives.
//   - Logging: the reference resolves `ILoggerFactory` from the container. Here
//     the hosting layer OWNS one `LoggerFactory` and threads it, because a
//     `LoggerFactory` built by `addLogging` does not yet inject the registered
//     provider set (logging issue #75). The registered providers are resolved
//     off the built container and folded into the owned factory, so the host's
//     own loggers -- and any composite logger already handed out -- light up.

import type { IConfiguration } from "@rhombus-std/config.core";
import type { ServiceManifest } from "@rhombus-std/di";
import type { ServiceProvider } from "@rhombus-std/di.core";
import {
  Environments,
  HOST_APPLICATION_LIFETIME_TOKEN,
  type HostBuilderContext,
  HostDefaults,
  type IHost,
  type IHostLifetime,
} from "@rhombus-std/hosting.core";
import { LOGGER_FACTORY_TOKEN, LOGGER_PROVIDER_TOKEN, LoggerFactory } from "@rhombus-std/logging";
import type { ILoggerProvider } from "@rhombus-std/logging.core";
import { process } from "@rhombus-std/primitives";
import type { Func } from "@rhombus-toolkit/func";
import { isAbsolute, resolve as resolvePath } from "node:path";
import {
  CONFIGURATION_TOKEN,
  HOST_BUILDER_CONTEXT_TOKEN,
  HOST_ENVIRONMENT_TOKEN,
  HOST_LIFETIME_TOKEN,
  HOST_OPTIONS_CONFIGURE_TOKEN,
  HOST_OPTIONS_TOKEN,
} from "./framework-tokens";
import { HostOptions } from "./HostOptions";
import { ApplicationLifetime } from "./Internal/ApplicationLifetime";
import { Host } from "./Internal/Host";
import { HostingEnvironment } from "./Internal/HostingEnvironment";
import { NullLifetime } from "./Internal/NullLifetime";

/** The category the internal host writes its lifecycle log messages under. */
export const HOST_LOGGER_CATEGORY = "Rhombus.Hosting.Host";

/** The category the {@link ApplicationLifetime} writes its callback-error messages under. */
export const APPLICATION_LIFETIME_CATEGORY = "Rhombus.Hosting.ApplicationLifetime";

/** The hosting-owned framework singletons threaded through the composition. */
export interface FrameworkServices {
  /** The single {@link LoggerFactory} the host threads to every framework logger. */
  readonly loggerFactory: LoggerFactory;
  /** The single {@link ApplicationLifetime} the host drives and hands back via DI. */
  readonly applicationLifetime: ApplicationLifetime;
  /** The resolved {@link HostOptions} the host obeys. */
  readonly hostOptions: HostOptions;
}

/**
 * Resolves a content-root path against `basePath`: returns `basePath` for an
 * empty input, the path itself when already absolute, otherwise the path
 * resolved against `basePath`. Port of the reference `ResolveContentRootPath`.
 */
export function resolveContentRootPath(
  contentRootPath: string | undefined,
  basePath: string,
): string {
  if (!contentRootPath) {
    return basePath;
  }
  if (isAbsolute(contentRootPath)) {
    return contentRootPath;
  }
  return resolvePath(basePath, contentRootPath);
}

/**
 * Constructs the mutable {@link HostingEnvironment} from `configuration`,
 * reading the {@link HostDefaults} keys -- port of the reference
 * `CreateHostingEnvironment`. `contentRootFileProvider` keeps its
 * `NullFileProvider` default (the physical file provider is deferred, decisions.md
 * §20). `basePath` defaults to the current working directory, the analog of the
 * reference `AppContext.BaseDirectory`.
 */
export function createHostingEnvironment(configuration: IConfiguration): HostingEnvironment {
  const environment = new HostingEnvironment();
  environment.environmentName = configuration.get(HostDefaults.environmentKey) ?? Environments.Production;
  environment.contentRootPath = resolveContentRootPath(
    configuration.get(HostDefaults.contentRootKey),
    process.cwd(),
  );
  const applicationName = configuration.get(HostDefaults.applicationKey);
  if (applicationName) {
    environment.applicationName = applicationName;
  }
  return environment;
}

/**
 * Constructs the hosting-owned framework singletons: one {@link LoggerFactory},
 * the {@link ApplicationLifetime} (logging through it), and an un-initialized
 * {@link HostOptions}. {@link resolveHost} folds the final configuration into
 * `hostOptions` and applies the `configureHostOptions` mutations at build time
 * -- deferred to then so the modern builder's live {@link IConfiguration} is
 * fully populated first.
 */
export function createFrameworkServices(): FrameworkServices {
  const loggerFactory = new LoggerFactory([]);
  const applicationLifetime = new ApplicationLifetime(
    loggerFactory.createLogger(APPLICATION_LIFETIME_CATEGORY),
  );
  return { loggerFactory, applicationLifetime, hostOptions: new HostOptions() };
}

/**
 * Registers the framework services into `services` -- the port of
 * `PopulateServiceCollection`. Runs BEFORE the user's configure-services
 * delegates so a later `useConsoleLifetime` (which appends a
 * {@link HOST_LIFETIME_TOKEN} registration) wins last over the default
 * {@link NullLifetime} registered here.
 */
export function populateFrameworkServices(
  services: ServiceManifest,
  context: HostBuilderContext,
  environment: HostingEnvironment,
  configuration: IConfiguration,
  framework: FrameworkServices,
): void {
  services.addValue(HOST_ENVIRONMENT_TOKEN, environment);
  services.addValue(HOST_BUILDER_CONTEXT_TOKEN, context);
  services.addValue(CONFIGURATION_TOKEN, configuration);
  services.addValue(HOST_APPLICATION_LIFETIME_TOKEN, framework.applicationLifetime);
  services.addValue(HOST_OPTIONS_TOKEN, framework.hostOptions);
  services.addValue(LOGGER_FACTORY_TOKEN, framework.loggerFactory);

  // The default host lifetime. `useConsoleLifetime` appends a ConsoleLifetime
  // registration under the same token; di.core is append-only last-wins, so the
  // console lifetime overrides this when requested.
  services.add(HOST_LIFETIME_TOKEN, NullLifetime, [[]]);
}

/**
 * Builds the provider and constructs the internal {@link Host} -- the port of
 * `ResolveHost`. Loads the container's registered {@link ILoggerProvider}s into
 * the owned {@link LoggerFactory}, resolves the (possibly overridden) host
 * lifetime, and hands the internal host its dependencies directly.
 *
 * `@rhombus-std/di` MUST be imported by the caller before this runs so
 * `ServiceManifest.build()` is patched on (di.core alone throws in `build()`).
 *
 * `configuration` is the final application configuration folded into
 * {@link HostOptions} before the `configureHostOptions` mutations run.
 */
export function resolveHost(
  services: ServiceManifest,
  framework: FrameworkServices,
  configuration: IConfiguration,
): IHost {
  const provider: ServiceProvider = services.build();

  const loggerProviders = provider.resolve<ILoggerProvider[]>(`Array<${LOGGER_PROVIDER_TOKEN}>`);
  for (const loggerProvider of loggerProviders) {
    framework.loggerFactory.addProvider(loggerProvider);
  }

  // Fold the final configuration into HostOptions, then apply every
  // `configureHostOptions` mutation (registered as a value in
  // `populateFrameworkServices`; the consumer resolving HOST_OPTIONS_TOKEN sees
  // the same mutated instance).
  framework.hostOptions.initialize(configuration);
  const configureSteps = provider.resolve<Func<[HostOptions], void>[]>(
    `Array<${HOST_OPTIONS_CONFIGURE_TOKEN}>`,
  );
  for (const configureStep of configureSteps) {
    configureStep(framework.hostOptions);
  }

  const hostLifetime = provider.resolve<IHostLifetime>(HOST_LIFETIME_TOKEN);
  const logger = framework.loggerFactory.createLogger(HOST_LOGGER_CATEGORY);

  return new Host(
    provider,
    framework.applicationLifetime,
    logger,
    hostLifetime,
    framework.hostOptions,
  );
}
