// HostApplicationBuilderSettings -- ported from the reference hosting runtime's
// `HostApplicationBuilderSettings`. Controls the initial configuration and
// whether the modern builder applies its pre-configured defaults.

import type { IConfigurationManager } from "@rhombus-std/config.core";

/** Settings for constructing a {@link import("./host-application-builder").HostApplicationBuilder}. */
export class HostApplicationBuilderSettings {
  /**
   * Whether the builder is constructed WITHOUT its pre-configured defaults
   * (content root, environment-variable/command-line host configuration,
   * `appsettings` app configuration, the console logging provider). Defaults to
   * `false` (defaults applied).
   */
  public disableDefaults = false;

  /** The command-line arguments to add to the configuration. */
  public args?: readonly string[];

  /**
   * The initial configuration object. These sources can influence the
   * {@link import("@rhombus-std/hosting.core").IHostEnvironment} through the
   * {@link import("@rhombus-std/hosting.core").HostDefaults} keys. When omitted,
   * a fresh {@link IConfigurationManager} is created.
   */
  public configuration?: IConfigurationManager;

  /** The environment name. */
  public environmentName?: string;

  /** The application name. */
  public applicationName?: string;

  /** The content root path. */
  public contentRootPath?: string;
}
