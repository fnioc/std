import type { IConfiguration } from "@rhombus-std/config.core";
import type { IHostEnvironment } from "./IHostEnvironment";

/**
 * Context carrying the common services shared across the host build process.
 * Some properties are populated by the host as the build progresses.
 */
export interface HostBuilderContext {
  /** The {@link IHostEnvironment} initialized by the host. */
  hostingEnvironment: IHostEnvironment;

  /**
   * The {@link IConfiguration} containing the merged configuration of the
   * application and the host.
   */
  configuration: IConfiguration;

  /**
   * A central location for sharing state between components during the host
   * building process.
   */
  readonly properties: Map<string | symbol, unknown>;
}
