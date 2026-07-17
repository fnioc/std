// The shared BrowserLifetime registration — the composition seam both entry
// points route through: `useBrowserLifetime` (the classic-builder augmentation)
// and `BrowserHost.createApplicationBuilder` (the modern-builder facade).
// Mirrors hosting's `useConsoleLifetime` registration shape: the options land
// as a value, and the lifetime lands as a factory under the imported
// HOST_LIFETIME_TOKEN — di.core is append-only last-wins, so this overrides the
// default NullLifetime registered by the host composition.

import { type IResolver, RESOLVER_TOKEN } from '@rhombus-std/di.core';
import type { IServiceManifest } from '@rhombus-std/di.core';
import { HOST_LIFETIME_TOKEN } from '@rhombus-std/hosting';
import { HOST_APPLICATION_LIFETIME_TOKEN, type IHostApplicationLifetime } from '@rhombus-std/hosting.core';
import { LOGGER_FACTORY_TOKEN } from '@rhombus-std/logging';
import type { ILoggerFactory } from '@rhombus-std/logging.core';
import { BrowserLifetime } from './BrowserLifetime';
import type { BrowserLifetimeOptions } from './BrowserLifetimeOptions';
import type { PageContext } from './page-context';
import { PageLifecycleEvents } from './PageLifecycleEvents';
import { BROWSER_LIFETIME_OPTIONS_TOKEN, PAGE_LIFECYCLE_EVENTS_TOKEN } from './tokens';

/**
 * Registers `options`, the eagerly-attached {@link PageLifecycleEvents} bridge,
 * and a {@link BrowserLifetime} factory (under the imported
 * {@link HOST_LIFETIME_TOKEN} — last registration wins over the default
 * NullLifetime). Both the modern facade and the classic `useBrowserLifetime`
 * route through here, so the bridge is registered on BOTH paths. The bridge is
 * an unowned value the container never disposes, so it is handed to the
 * lifetime, whose `stop`/dispose detaches it — see {@link BrowserLifetime}.
 * `context` is threaded for tests; production callers omit it and both the
 * lifetime and the bridge attach to the platform document/window.
 */
export function registerBrowserLifetime(
  services: IServiceManifest,
  options: BrowserLifetimeOptions,
  context?: PageContext,
): void {
  services.addValue(BROWSER_LIFETIME_OPTIONS_TOKEN, options);

  const pageLifecycleEvents = new PageLifecycleEvents(context);
  services.addValue(PAGE_LIFECYCLE_EVENTS_TOKEN, pageLifecycleEvents);

  services.addFactory(
    HOST_LIFETIME_TOKEN,
    (resolver: IResolver) =>
      new BrowserLifetime(
        resolver.resolve<BrowserLifetimeOptions>(BROWSER_LIFETIME_OPTIONS_TOKEN),
        resolver.resolve<IHostApplicationLifetime>(HOST_APPLICATION_LIFETIME_TOKEN),
        resolver.resolve<ILoggerFactory>(LOGGER_FACTORY_TOKEN),
        pageLifecycleEvents,
      ),
    [[RESOLVER_TOKEN]],
  );
}
