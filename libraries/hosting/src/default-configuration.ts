// The shared "apply pre-configured defaults" logic -- ported from the reference
// hosting runtime's `HostingHostBuilderExtensions.ApplyDefaultHostConfiguration`
// / `ApplyDefaultAppConfiguration` / `AddDefaultServices` / `SetDefaultContentRoot`.
//
// Written against the `IConfigurationBuilder` INTERFACE (via `.add(source)` with
// the provider source classes constructed directly) so BOTH the classic
// `HostBuilder` (over a `ConfigurationBuilder`) and the modern
// `HostApplicationBuilder` (over a `ConfigurationManager`) reuse them -- the
// fluent `addJsonFile` / `addEnvironmentVariables` / `addCommandLine` sugar is
// installed only on `ConfigurationBuilder`, not `ConfigurationManager`, so the
// defaults go through the raw sources instead. (Importing the provider packages
// still installs that sugar for user code as a side effect.)

import { MemoryConfigurationSource } from "@rhombus-std/config";
import { CommandLineConfigurationSource } from "@rhombus-std/config.commandline";
import type { IConfigurationBuilder } from "@rhombus-std/config.core";
import { EnvironmentVariablesConfigurationSource } from "@rhombus-std/config.env";
import { JsonConfigurationSource } from "@rhombus-std/config.json";
import { ServiceManifest } from "@rhombus-std/di";
import { HostDefaults } from "@rhombus-std/hosting.core";
import type { IHostEnvironment } from "@rhombus-std/hosting.core";
import { addProvider, LoggingBuilder } from "@rhombus-std/logging";
import { ConsoleLoggerProvider } from "@rhombus-std/logging.console";

/**
 * The environment-variable prefix the host configuration is seeded from. The
 * neutral in-repo analog of the reference's vendor-prefixed host env variables.
 */
export const HOST_ENVIRONMENT_VARIABLE_PREFIX = "RHOMBUS_";

/** Adds a command-line source over `args` when non-empty. */
export function addCommandLineConfig(builder: IConfigurationBuilder, args?: readonly string[]): void {
  if (args?.length) {
    builder.add(new CommandLineConfigurationSource(args));
  }
}

/** Seeds the content root to the current working directory. */
export function setDefaultContentRoot(builder: IConfigurationBuilder): void {
  builder.add(
    new MemoryConfigurationSource({ initialData: { [HostDefaults.contentRootKey]: process.cwd() } }),
  );
}

/**
 * Applies the default HOST configuration: content root = cwd, then the prefixed
 * environment variables, then the command-line args.
 */
export function applyDefaultHostConfiguration(
  builder: IConfigurationBuilder,
  args?: readonly string[],
): void {
  setDefaultContentRoot(builder);
  builder.add(new EnvironmentVariablesConfigurationSource({ prefix: HOST_ENVIRONMENT_VARIABLE_PREFIX }));
  addCommandLineConfig(builder, args);
}

/**
 * Applies the default APPLICATION configuration: `appsettings.json` and
 * `appsettings.{environment}.json` (both optional), then the environment
 * variables, then the command-line args.
 */
export function applyDefaultAppConfiguration(
  builder: IConfigurationBuilder,
  environment: IHostEnvironment,
  args?: readonly string[],
): void {
  builder.add(new JsonConfigurationSource("appsettings.json", { optional: true }));
  builder.add(new JsonConfigurationSource(`appsettings.${environment.environmentName}.json`, { optional: true }));
  builder.add(new EnvironmentVariablesConfigurationSource());
  addCommandLineConfig(builder, args);
}

/**
 * Registers the default framework services -- the console logging provider.
 *
 * The reference also registers the Debug, EventSource, and (on Windows) EventLog
 * providers; those provider packages do not exist in this repo, so only the
 * console provider is registered (see scaffoldedIncomplete for the missing sinks).
 */
export function addDefaultServices(services: ServiceManifest): void {
  addProvider(new LoggingBuilder(services), new ConsoleLoggerProvider());
}
