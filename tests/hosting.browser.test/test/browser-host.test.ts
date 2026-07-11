import { HOST_LIFETIME_TOKEN } from "@rhombus-std/hosting";
import {
  BROWSER_LIFETIME_OPTIONS_TOKEN,
  BrowserHost,
  BrowserLifetime,
  type BrowserLifetimeOptions,
  createBrowserEnvironment,
  PAGE_LIFECYCLE_EVENTS_TOKEN,
  PageLifecycleEvents,
} from "@rhombus-std/hosting.browser";
import {
  Environments,
  HOST_APPLICATION_LIFETIME_TOKEN,
  type IHostApplicationLifetime,
  type IHostLifetime,
} from "@rhombus-std/hosting.core";
import { LOGGER_PROVIDER_TOKEN } from "@rhombus-std/logging";
import { BrowserConsoleLoggerProvider } from "@rhombus-std/logging.browserconsole";
import type { ILoggerProvider } from "@rhombus-std/logging.core";
import { expect, test } from "bun:test";
import { makeFakePage } from "./fakes";

test("createBrowserEnvironment: names from settings, content root '/', null file provider", () => {
  const environment = createBrowserEnvironment({
    environmentName: Environments.Development,
    applicationName: "spa",
  });

  expect(environment.environmentName).toBe("Development");
  expect(environment.applicationName).toBe("spa");
  expect(environment.contentRootPath).toBe("/");
  expect(environment.contentRootFileProvider.getFileInfo("anything").exists).toBe(false);
  expect(environment.isDevelopment()).toBe(true);

  expect(createBrowserEnvironment().environmentName).toBe(Environments.Production);
});

test("the facade composes settings config, browser environment, console logging, lifetime, and the bridge", () => {
  const page = makeFakePage();

  const builder = BrowserHost.createApplicationBuilder({
    environmentName: Environments.Development,
    applicationName: "spa",
    initialData: { "feature:flag": "on" },
    configureLifetime: (options) => {
      options.stopOnPagehide = false;
    },
    pageContext: page.context,
  });

  // Environment: browser-shaped through the ordinary builder settings.
  expect(builder.environment.environmentName).toBe("Development");
  expect(builder.environment.applicationName).toBe("spa");
  expect(builder.environment.contentRootPath).toBe("/");
  expect(builder.environment.contentRootFileProvider.getFileInfo("x").exists).toBe(false);

  // Configuration: seeded from settings.initialData.
  expect(builder.configuration.get("feature:flag")).toBe("on");

  const host = builder.build();

  // Logging: the browser console provider is registered.
  const providers = host.services.resolve<ILoggerProvider[]>(`Array<${LOGGER_PROVIDER_TOKEN}>`);
  expect(providers.some((provider) => {
    return provider instanceof BrowserConsoleLoggerProvider;
  })).toBe(true);

  // Lifetime: the BrowserLifetime registration wins over the NullLifetime
  // default (last registration wins), with the configured options.
  const lifetime = host.services.resolve<IHostLifetime>(HOST_LIFETIME_TOKEN);
  expect(lifetime).toBeInstanceOf(BrowserLifetime);
  const options = host.services.resolve<BrowserLifetimeOptions>(BROWSER_LIFETIME_OPTIONS_TOKEN);
  expect(options.stopOnPagehide).toBe(false);

  // The bridge: registered as a value, eagerly attached to the page context.
  const bridge = host.services.resolve<PageLifecycleEvents>(PAGE_LIFECYCLE_EVENTS_TOKEN);
  expect(bridge).toBeInstanceOf(PageLifecycleEvents);
  expect(page.document.registeredTypes).toContain("visibilitychange");

  host[Symbol.dispose]();
});

test("host stop detaches both the lifetime and the bridge listeners — no leak across host cycles", async () => {
  const page = makeFakePage();

  const builder = BrowserHost.createApplicationBuilder({ pageContext: page.context });
  const host = builder.build();

  // The bridge attaches its five listeners eagerly at composition.
  const bridge = host.services.resolve<PageLifecycleEvents>(PAGE_LIFECYCLE_EVENTS_TOKEN);
  expect(bridge).toBeInstanceOf(PageLifecycleEvents);
  expect(page.document.listenerCount + page.window.listenerCount).toBe(5);

  // Start adds the lifetime's own five listeners over the same document/window.
  await host.start();
  expect(page.document.listenerCount + page.window.listenerCount).toBe(10);

  // Stop must detach EVERY listener — the lifetime's and the (unowned, so
  // container-undisposed) bridge's — or a multi-host page leaks five per cycle.
  await host.stop();
  expect(page.document.listenerCount).toBe(0);
  expect(page.window.listenerCount).toBe(0);

  host[Symbol.dispose]();
});

test("a built browser host starts, stops on terminal pagehide via the main.ts wiring, and never on bfcache", async () => {
  const page = makeFakePage();
  const events: string[] = [];

  const builder = BrowserHost.createApplicationBuilder({ pageContext: page.context });
  builder.services.addHostedService(
    class Worker {
      public async start(): Promise<void> {
        events.push("start");
      }
      public async stop(): Promise<void> {
        events.push("stop");
      }
    },
    [[]],
  );
  const host = builder.build();

  // The documented one-line main.ts stop wiring.
  const applicationLifetime = host.services.resolve<IHostApplicationLifetime>(HOST_APPLICATION_LIFETIME_TOKEN);
  let stopDriven: Promise<void> | undefined;
  applicationLifetime.applicationStopping.addEventListener("abort", () => {
    stopDriven = host.stop();
  }, { once: true });

  await host.start();
  expect(events).toEqual(["start"]);

  // bfcache pagehide: the host MUST NOT stop.
  page.pageHide(true);
  expect(stopDriven).toBeUndefined();
  expect(events).toEqual(["start"]);

  // Terminal pagehide: stopApplication fires, the wiring drives the pipeline.
  page.pageHide(false);
  expect(stopDriven).toBeDefined();
  await stopDriven;
  expect(events).toEqual(["start", "stop"]);

  host[Symbol.dispose]();
});
