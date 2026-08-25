import { Type } from '@rhombus-std/di.core';
import { HOST_LIFETIME_TYPE } from '@rhombus-std/hosting';
import { BROWSER_LIFETIME_OPTIONS_TYPE, BrowserHost, BrowserLifetime, type BrowserLifetimeOptions, createBrowserEnvironment, PAGE_LIFECYCLE_EVENTS_TYPE,
  PageLifecycleEvents } from '@rhombus-std/hosting.browser';
import { Environments, getHostedServiceManifest, HOSTED_SERVICE_TYPE, type IHostLifetime } from '@rhombus-std/hosting.core';
import { LOGGER_PROVIDER_TYPE } from '@rhombus-std/logging';
import { BrowserConsoleLoggerProvider } from '@rhombus-std/logging.browserconsole';
import type { ILoggerProvider } from '@rhombus-std/logging.core';
import { expect, test } from 'bun:test';
import { makeFakePage } from './fakes';

test("createBrowserEnvironment: names from settings, content root '/', null file provider", () => {
  const environment = createBrowserEnvironment({ environmentName: Environments.Development, applicationName: 'spa' });

  expect(environment.environmentName).toBe('Development');
  expect(environment.applicationName).toBe('spa');
  expect(environment.contentRootPath).toBe('/');
  expect(environment.contentRootFileProvider.getFileInfo('anything').exists).toBe(false);
  expect(environment.isDevelopment()).toBe(true);

  expect(createBrowserEnvironment().environmentName).toBe(Environments.Production);
});

test('the facade composes settings config, browser environment, console logging, lifetime, and the bridge', () => {
  const page = makeFakePage();

  const builder = BrowserHost.createApplicationBuilder({ environmentName: Environments.Development, applicationName: 'spa', initialData: { 'feature:flag': 'on' }, configureLifetime: (options) => {
    options.stopOnPagehide = false;
  }, pageContext: page.context });

  // Environment: browser-shaped through the ordinary builder settings.
  expect(builder.environment.environmentName).toBe('Development');
  expect(builder.environment.applicationName).toBe('spa');
  expect(builder.environment.contentRootPath).toBe('/');
  expect(builder.environment.contentRootFileProvider.getFileInfo('x').exists).toBe(false);

  // Configuration: seeded from settings.initialData.
  expect(builder.config.get('feature:flag')).toBe('on');

  const host = builder.build();

  // Logging: the browser console provider is registered.
  const providers: ILoggerProvider[] = host.services.resolve(Type.array(LOGGER_PROVIDER_TYPE));
  expect(providers.some((provider) => {
    return provider instanceof BrowserConsoleLoggerProvider;
  })).toBe(true);

  // Lifetime: the BrowserLifetime registration wins over the NullLifetime
  // default (last registration wins), with the configured options.
  const lifetime: IHostLifetime = host.services.resolve(HOST_LIFETIME_TYPE);
  expect(lifetime).toBeInstanceOf(BrowserLifetime);
  const options: BrowserLifetimeOptions = host.services.resolve(BROWSER_LIFETIME_OPTIONS_TYPE);
  expect(options.stopOnPagehide).toBe(false);

  // The bridge: registered as a value, eagerly attached to the page context.
  const bridge: PageLifecycleEvents = host.services.resolve(PAGE_LIFECYCLE_EVENTS_TYPE);
  expect(bridge).toBeInstanceOf(PageLifecycleEvents);
  expect(page.document.registeredTypes).toContain('visibilitychange');

  host[Symbol.dispose]();
});

test('host stop disposes the single bridge listener set — no leak across host cycles', async () => {
  const page = makeFakePage();

  const builder = BrowserHost.createApplicationBuilder({ pageContext: page.context });
  const host = builder.build();

  // The bridge — the single DOM-listening component — attaches its five
  // listeners eagerly at composition.
  const bridge: PageLifecycleEvents = host.services.resolve(PAGE_LIFECYCLE_EVENTS_TYPE);
  expect(bridge).toBeInstanceOf(PageLifecycleEvents);
  expect(page.document.listenerCount + page.window.listenerCount).toBe(5);

  // Start subscribes the lifetime to the bridge; it adds NO DOM listeners.
  await host.start();
  expect(page.document.listenerCount + page.window.listenerCount).toBe(5);

  // Stop disposes the (unowned, so container-undisposed) bridge via the
  // lifetime — or a multi-host page leaks five listeners per cycle.
  await host.stop();
  expect(page.document.listenerCount).toBe(0);
  expect(page.window.listenerCount).toBe(0);

  host[Symbol.dispose]();
});

test('BrowserHost.run() starts, ignores a bfcache pagehide, and stops on a terminal pagehide', async () => {
  const page = makeFakePage();
  const events: string[] = [];

  const runPromise = BrowserHost.run({ pageContext: page.context }, (builder) => {
    builder.services = builder.services.addMany(getHostedServiceManifest(class Worker {
      public async start(): Promise<void> {
        events.push('start');
      }
      public async stop(): Promise<void> {
        events.push('stop');
      }
    }, Type.ctor(HOSTED_SERVICE_TYPE, [[]])));
  });

  // Wait until the host has started (the lifetime subscribes before hosted
  // services run, so an observed 'start' means the lifetime is listening).
  for (let attempt = 0; attempt < 1000 && !events.includes('start'); attempt += 1) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1));
  }
  expect(events).toEqual(['start']);

  // bfcache pagehide: the host MUST NOT stop.
  page.pageHide(true);
  expect(events).toEqual(['start']);

  // Terminal pagehide: stopApplication fires and runAsync drives the stop.
  page.pageHide(false);
  await runPromise;
  expect(events).toEqual(['start', 'stop']);
});
