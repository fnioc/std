// The shared BrowserLifetime registration — the composition seam both entry
// points route through: `useBrowserLifetime` (the classic-builder augmentation)
// and `BrowserHost.createApplicationBuilder` (the modern-builder facade).
// Mirrors hosting's `useConsoleLifetime` registration shape: the options land
// as a value, and the lifetime lands as a factory under the imported
// HOST_LIFETIME_TOKEN — di.core is append-only last-wins, so this overrides the
// default NullLifetime registered by the host composition.

import { type Resolver, RESOLVER_TOKEN } from "@rhombus-std/di.core";
import type { ServiceManifest } from "@rhombus-std/di.core";
import { HOST_LIFETIME_TOKEN } from "@rhombus-std/hosting";
import { HOST_APPLICATION_LIFETIME_TOKEN, type IHostApplicationLifetime } from "@rhombus-std/hosting.core";
import { LOGGER_FACTORY_TOKEN } from "@rhombus-std/logging";
import type { ILoggerFactory } from "@rhombus-std/logging.core";
import { BrowserLifetime } from "./browser-lifetime";
import type { BrowserLifetimeOptions } from "./BrowserLifetimeOptions";
import type { PageContext } from "./page-context";
import { BROWSER_LIFETIME_OPTIONS_TOKEN } from "./tokens";

/**
 * Registers `options` and a {@link BrowserLifetime} factory (under the
 * imported {@link HOST_LIFETIME_TOKEN} — last registration wins over the
 * default NullLifetime). `context` is threaded for tests; production callers
 * omit it and the lifetime attaches to the platform document/window.
 */
export function registerBrowserLifetime(
  services: ServiceManifest,
  options: BrowserLifetimeOptions,
  context?: PageContext,
): void {
  services.addValue(BROWSER_LIFETIME_OPTIONS_TOKEN, options);
  services.addFactory(
    HOST_LIFETIME_TOKEN,
    (resolver: Resolver) =>
      new BrowserLifetime(
        resolver.resolve<BrowserLifetimeOptions>(BROWSER_LIFETIME_OPTIONS_TOKEN),
        resolver.resolve<IHostApplicationLifetime>(HOST_APPLICATION_LIFETIME_TOKEN),
        resolver.resolve<ILoggerFactory>(LOGGER_FACTORY_TOKEN),
        context,
      ),
    [[RESOLVER_TOKEN]],
  );
}
