// The static `BrowserHost` facade — sugar over the ordinary
// `Host.createEmptyApplicationBuilder`, never a fork of the host. It returns
// the SAME `HostApplicationBuilder` the plain path returns, with the browser
// composition pre-applied:
//
//   - in-memory configuration seeded from `settings.initialData`,
//   - a browser-shaped environment (names from settings, content root "/",
//     NullFileProvider — the HostingEnvironment default),
//   - browser console logging (@rhombus-std/logging.browserconsole),
//   - the BrowserLifetime registered under the imported HOST_LIFETIME_TOKEN
//     (last registration wins over the default NullLifetime),
//   - the PageLifecycleEvents bridge registered (as a value, eagerly
//     attached) under PAGE_LIFECYCLE_EVENTS_TOKEN.
//
// Stop wiring: the built host is NOT resolvable from the container, so the
// browser lifetime can only REQUEST the stop (stopApplication). main.ts
// drives the pipeline with one line — see ./browser-lifetime.

import { MemoryConfigurationSource } from "@rhombus-std/config";
import type { ConfigurationData } from "@rhombus-std/config";
import { Host, type HostApplicationBuilder, HostApplicationBuilderSettings } from "@rhombus-std/hosting";
import { BrowserConsoleLoggerExtensions } from "@rhombus-std/logging.browserconsole";
import type { Func } from "@rhombus-toolkit/func";
import { BrowserLifetimeOptions } from "./BrowserLifetimeOptions";
import type { PageContext } from "./page-context";
import { PageLifecycleEvents } from "./PageLifecycleEvents";
import { registerBrowserLifetime } from "./register-browser-lifetime";
import { PAGE_LIFECYCLE_EVENTS_TOKEN } from "./tokens";

/** Settings for {@link BrowserHost.createApplicationBuilder}. */
export interface BrowserHostApplicationBuilderSettings {
  /** The environment name; defaults to Production. */
  environmentName?: string;
  /** The application name. */
  applicationName?: string;
  /** Key/value seed data for the in-memory configuration source. */
  initialData?: ConfigurationData;
  /** Configures the {@link BrowserLifetimeOptions} (e.g. `stopOnPagehide`). */
  configureLifetime?: Func<[BrowserLifetimeOptions], void>;
  /**
   * The document/window pair to attach to; defaults to the platform globals.
   * Injectable for tests.
   */
  pageContext?: PageContext;
}

/** Convenience factory for creating browser-composed application builders. */
export const BrowserHost = {
  /**
   * A modern {@link HostApplicationBuilder} with the browser composition
   * pre-applied (see the module documentation). Plain sugar: everything here
   * is the ordinary builder surface, and every piece can be re-configured or
   * overridden on the returned builder.
   */
  createApplicationBuilder(settings?: BrowserHostApplicationBuilderSettings): HostApplicationBuilder {
    const hostSettings = new HostApplicationBuilderSettings();
    hostSettings.environmentName = settings?.environmentName;
    hostSettings.applicationName = settings?.applicationName;
    // An absolute content root short-circuits the environment's process.cwd()
    // lookup — a browser has no process global.
    hostSettings.contentRootPath = "/";
    const builder = Host.createEmptyApplicationBuilder(hostSettings);

    if (settings?.initialData !== undefined) {
      builder.configuration.add(new MemoryConfigurationSource({ initialData: settings.initialData }));
    }

    // The builder's environment is already browser-shaped: content root "/"
    // (via the settings override above) and the HostingEnvironment default
    // NullFileProvider — see ./browser-environment for the standalone factory.

    BrowserConsoleLoggerExtensions.addBrowserConsole(builder.logging);

    const lifetimeOptions = new BrowserLifetimeOptions();
    settings?.configureLifetime?.(lifetimeOptions);
    registerBrowserLifetime(builder.services, lifetimeOptions, settings?.pageContext);

    builder.services.addValue(
      PAGE_LIFECYCLE_EVENTS_TOKEN,
      new PageLifecycleEvents(settings?.pageContext),
    );

    return builder;
  },
};
