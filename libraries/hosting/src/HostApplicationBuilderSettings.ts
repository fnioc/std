import type { IConfigManager } from '@rhombus-std/config.core';

/** Settings for constructing a {@link import("./HostApplicationBuilder").HostApplicationBuilder}. */
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
   * a fresh {@link IConfigManager} is created.
   */
  public config?: IConfigManager;

  public environmentName?: string;

  public applicationName?: string;

  public contentRootPath?: string;
}
