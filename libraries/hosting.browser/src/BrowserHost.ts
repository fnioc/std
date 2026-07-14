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
//     (last registration wins over the default NullLifetime), alongside the
//     eagerly-attached PageLifecycleEvents bridge under
//     PAGE_LIFECYCLE_EVENTS_TOKEN — both via registerBrowserLifetime, the seam
//     the classic useBrowserLifetime path shares.
//
// Running: `BrowserHost.run()` builds and drives the full pipeline (start ->
// wait-for-shutdown -> stop) via hosting's `runAsync`, so the caller no longer
// wires the stop by hand.

import { MemoryConfigurationSource } from '@rhombus-std/config';
import type { ConfigurationData } from '@rhombus-std/config';
import { Host, type HostApplicationBuilder, HostApplicationBuilderSettings } from '@rhombus-std/hosting';
import { BrowserConsoleLoggerExtensions } from '@rhombus-std/logging.browserconsole';
import type { Action, Func } from '@rhombus-toolkit/func';
import { BrowserLifetimeOptions } from './BrowserLifetimeOptions';
import type { PageContext } from './page-context';
import { registerBrowserLifetime } from './register-browser-lifetime';

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
    hostSettings.contentRootPath = '/';
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
    // Registers the BrowserLifetime AND the eagerly-attached PageLifecycleEvents
    // bridge (whose teardown rides the lifetime — see register-browser-lifetime).
    registerBrowserLifetime(builder.services, lifetimeOptions, settings?.pageContext);

    return builder;
  },

  /**
   * Builds a browser-composed host and runs it: `createApplicationBuilder` ->
   * `configureApp` (register your services here) -> `build().runAsync()`. The
   * returned promise completes only once shutdown is triggered (a terminal
   * `pagehide`, when `stopOnPagehide` is set), after the host has stopped and
   * disposed.
   *
   * `runAsync` drives the full pipeline (start -> wait-for-shutdown -> stop), so
   * there is no stop wiring to write by hand. Note the shutdown is best-effort:
   * on a real page close the async stop may be cut off before it finishes —
   * anything that MUST survive a close belongs on
   * {@link import("./PageLifecycleEvents").PageLifecycleEvents.onFlush}
   * (synchronous), not a hosted service's `stop()`.
   */
  run(
    settings?: BrowserHostApplicationBuilderSettings,
    configureApp?: Action<[HostApplicationBuilder]>,
  ): Promise<void> {
    const builder = BrowserHost.createApplicationBuilder(settings);
    configureApp?.(builder);
    return builder.build().runAsync();
  },
};
