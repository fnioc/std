// Shared "apply default configuration" helpers, written against the plain
// `IConfigBuilder` interface (via `.add(source)` with the provider source
// classes constructed directly) so both the classic `HostBuilder` (over a
// `ConfigBuilder`) and the modern `HostApplicationBuilder` (over a
// `ConfigManager`) reuse them.
//
// The fluent `addJsonFile` / `addEnvironmentVariables` / `addCommandLine` sugar
// is installed on both concrete classes, but that doesn't help here: these
// functions are also shared with `IHostBuilder.configureHostConfig` /
// `configureAppConfig`, whose delegate parameter is typed as the plain
// `IConfigBuilder` interface -- a declaration-merged prototype method isn't
// visible through an interface type, only through the concrete class it was
// merged onto. So the defaults go through the raw sources instead, here.

import { MemoryConfigSource } from '@rhombus-std/config';
import { CommandLineConfigSource } from '@rhombus-std/config.commandline';
import type { IConfigBuilder } from '@rhombus-std/config.core';
import { EnvironmentVariablesConfigSource } from '@rhombus-std/config.env';
import { JsonConfigSource } from '@rhombus-std/config.json';
import type { ServiceProviderOptions } from '@rhombus-std/di2';
import { DefaultManifest } from '@rhombus-std/di2.core';
import type { Manifest } from '@rhombus-std/di2.core';
import { HostDefaults, HostEnvironmentEnvAugmentations, type IHostEnvironment } from '@rhombus-std/hosting.core';
import { LoggingBuilder, LoggingBuilderProviderAugmentations } from '@rhombus-std/logging';
import { ConsoleLoggerProvider } from '@rhombus-std/logging.console';
import { process } from '@rhombus-std/primitives';

/** The environment-variable prefix the host configuration is seeded from. */
export const HOST_ENVIRONMENT_VARIABLE_PREFIX = 'RHOMBUS_';

/** Adds a command-line source over `args` when non-empty. */
export function addCommandLineConfig(builder: IConfigBuilder, args?: readonly string[]): void {
  if (args?.length) {
    builder.add(new CommandLineConfigSource(args));
  }
}

/** Seeds the content root to the current working directory. */
export function setDefaultContentRoot(builder: IConfigBuilder): void {
  builder.add(new MemoryConfigSource({ initialData: { [HostDefaults.contentRootKey]: process.cwd() } }));
}

/**
 * Applies the default HOST configuration: content root = cwd, then the prefixed
 * environment variables, then the command-line args.
 */
export function applyDefaultHostConfig(builder: IConfigBuilder, args?: readonly string[]): void {
  setDefaultContentRoot(builder);
  builder.add(new EnvironmentVariablesConfigSource({ prefix: HOST_ENVIRONMENT_VARIABLE_PREFIX }));
  addCommandLineConfig(builder, args);
}

/**
 * Applies the default APPLICATION configuration: `appsettings.json` and
 * `appsettings.{environment}.json` (both optional), then the environment
 * variables, then the command-line args.
 */
export function applyDefaultAppConfig(builder: IConfigBuilder, environment: IHostEnvironment,
  args?: readonly string[]): void {
  builder.add(new JsonConfigSource('appsettings.json', { optional: true }));
  builder.add(new JsonConfigSource(`appsettings.${environment.environmentName}.json`, { optional: true }));
  builder.add(new EnvironmentVariablesConfigSource());
  addCommandLineConfig(builder, args);
}

/** Registers the default framework services: currently just the console logging provider. */
export function addDefaultServices(services: Manifest): Manifest {
  const builder = new LoggingBuilder(services);
  LoggingBuilderProviderAugmentations.addProvider(builder, new ConsoleLoggerProvider());
  // The chain is immutable, so the registration lives on the manifest the
  // builder now holds -- not on the one that was passed in.
  return builder.services;
}

/**
 * Builds the default {@link ServiceProviderOptions}. Scope and build-time
 * validation are enabled only in the Development environment, so a production
 * host pays no validation cost while a developer catches lifetime mistakes early.
 */
export function createDefaultServiceProviderOptions(environment: IHostEnvironment): ServiceProviderOptions {
  const isDevelopment = HostEnvironmentEnvAugmentations.isDevelopment(environment);
  return { validateOnBuild: isDevelopment };
}
