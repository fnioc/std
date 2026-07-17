// The static `Host` facade -- ported from the reference hosting runtime's static
// `Host` class. Convenience factory methods that hand back a builder with the
// pre-configured defaults already applied.

import type { IHostBuilder } from '@rhombus-std/hosting.core';
import { HostApplicationBuilder } from './HostApplicationBuilder';
import { HostApplicationBuilderSettings } from './HostApplicationBuilderSettings';
import { HostBuilder } from './HostBuilder';
import { HostingHostBuilderExtensions } from './HostingHostBuilderExtensions';

/** Convenience factories for creating pre-configured builders. */
export const Host = {
  /** A classic {@link HostBuilder} with the pre-configured defaults applied. */
  createDefaultBuilder(args?: readonly string[]): IHostBuilder {
    return HostingHostBuilderExtensions.configureDefaults(new HostBuilder(), args);
  },

  /**
   * A modern {@link HostApplicationBuilder} with the pre-configured defaults
   * applied. Accepts either the command-line args or a full
   * {@link HostApplicationBuilderSettings}.
   */
  createApplicationBuilder(
    argsOrSettings?: readonly string[] | HostApplicationBuilderSettings,
  ): HostApplicationBuilder {
    if (argsOrSettings === undefined || Array.isArray(argsOrSettings)) {
      const settings = new HostApplicationBuilderSettings();
      settings.args = argsOrSettings as readonly string[] | undefined;
      return new HostApplicationBuilder(settings);
    }
    return new HostApplicationBuilder(argsOrSettings as HostApplicationBuilderSettings);
  },

  /** A modern {@link HostApplicationBuilder} with NO pre-configured defaults. */
  createEmptyApplicationBuilder(settings?: HostApplicationBuilderSettings): HostApplicationBuilder {
    const resolved = settings ?? new HostApplicationBuilderSettings();
    resolved.disableDefaults = true;
    return new HostApplicationBuilder(resolved);
  },
};
