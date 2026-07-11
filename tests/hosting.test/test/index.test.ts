import { MemoryConfigurationSource } from "@rhombus-std/config";
import {
  BackgroundService,
  Host,
  HOST_APPLICATION_LIFETIME_TOKEN,
  HOST_ENVIRONMENT_TOKEN,
  HostBuilder,
  type IHostApplicationLifetime,
  type IHostedLifecycleService,
  type IHostEnvironment,
} from "@rhombus-std/hosting/internal/index";
import { HOSTED_SERVICE_TOKEN } from "@rhombus-std/hosting/internal/internal/Host";
import { expect, test } from "bun:test";

test("Host.createDefaultBuilder returns a configured builder", () => {
  const builder = Host.createDefaultBuilder();

  expect(builder.properties).toBeInstanceOf(Map);
});

test("HostBuilder.build runs and stops its hosted services", async () => {
  const events: string[] = [];

  class Worker {
    public async start(): Promise<void> {
      events.push("start");
    }
    public async stop(): Promise<void> {
      events.push("stop");
    }
  }

  const builder = new HostBuilder();
  builder.configureServices((_context, services) => {
    services.addHostedService(Worker, [[]]);
  });

  const host = builder.build();
  expect(host.services).toBeDefined();

  await host.start();
  expect(events).toEqual(["start"]);

  await host.stop();
  expect(events).toEqual(["start", "stop"]);

  host[Symbol.dispose]();
});

test("lifecycle ordering: starting -> start -> started -> applicationStarted -> stopping -> applicationStopping -> stop -> stopped -> applicationStopped", async () => {
  const events: string[] = [];

  class Recorder implements IHostedLifecycleService {
    public async starting(): Promise<void> {
      events.push("starting");
    }
    public async start(): Promise<void> {
      events.push("start");
    }
    public async started(): Promise<void> {
      events.push("started");
    }
    public async stopping(): Promise<void> {
      events.push("stopping");
    }
    public async stop(): Promise<void> {
      events.push("stop");
    }
    public async stopped(): Promise<void> {
      events.push("stopped");
    }
  }

  const builder = new HostBuilder();
  builder.configureServices((_context, services) => {
    services.addHostedService(Recorder, [[]]);
  });

  const host = builder.build();
  const lifetime = host.services.resolve<IHostApplicationLifetime>(HOST_APPLICATION_LIFETIME_TOKEN);
  lifetime.applicationStarted.addEventListener("abort", () => events.push("applicationStarted"), { once: true });
  lifetime.applicationStopping.addEventListener("abort", () => events.push("applicationStopping"), { once: true });
  lifetime.applicationStopped.addEventListener("abort", () => events.push("applicationStopped"), { once: true });

  await host.start();
  await host.stop();

  expect(events).toEqual([
    "starting",
    "start",
    "started",
    "applicationStarted",
    "stopping",
    "applicationStopping",
    "stop",
    "stopped",
    "applicationStopped",
  ]);

  host[Symbol.dispose]();
});

test("IHostApplicationLifetime.stopApplication triggers applicationStopping directly", () => {
  const builder = new HostBuilder();
  const host = builder.build();
  const lifetime = host.services.resolve<IHostApplicationLifetime>(HOST_APPLICATION_LIFETIME_TOKEN);

  expect(lifetime.applicationStopping.aborted).toBe(false);
  lifetime.stopApplication();
  expect(lifetime.applicationStopping.aborted).toBe(true);

  // Idempotent: a second call does not throw.
  lifetime.stopApplication();
  expect(lifetime.applicationStopping.aborted).toBe(true);

  host[Symbol.dispose]();
});

test("BackgroundService: execute runs on start; stop aborts its stopping signal", async () => {
  let executing = false;
  let stoppingAborted = false;

  class Worker extends BackgroundService {
    protected override async execute(stoppingSignal: AbortSignal): Promise<void> {
      executing = true;
      await new Promise<void>((resolve) => {
        stoppingSignal.addEventListener("abort", () => {
          stoppingAborted = true;
          resolve();
        }, { once: true });
      });
    }
  }

  const builder = new HostBuilder();
  builder.configureServices((_context, services) => {
    services.addHostedService(Worker, [[]]);
  });

  const host = builder.build();
  await host.start();

  // start() kicks execute() without awaiting; wait for it to actually begin.
  while (!executing) {
    await Promise.resolve();
  }
  expect(stoppingAborted).toBe(false);

  await host.stop();
  expect(stoppingAborted).toBe(true);

  host[Symbol.dispose]();
});

test("addHostedService registers many under one shared token; the host resolves and starts all of them", async () => {
  const started: string[] = [];

  class A {
    public async start(): Promise<void> {
      started.push("A");
    }
    public async stop(): Promise<void> {}
  }
  class B {
    public async start(): Promise<void> {
      started.push("B");
    }
    public async stop(): Promise<void> {}
  }
  class C {
    public async start(): Promise<void> {
      started.push("C");
    }
    public async stop(): Promise<void> {}
  }

  const builder = new HostBuilder();
  builder.configureServices((_context, services) => {
    services.addHostedService(A, [[]]);
    services.addHostedService(B, [[]]);
    services.addHostedService(C, [[]]);
  });

  const host = builder.build();
  expect(host.services.isService(HOSTED_SERVICE_TOKEN)).toBe(true);

  await host.start();
  expect(started).toEqual(["A", "B", "C"]);

  await host.stop();
  host[Symbol.dispose]();
});

test("IHostEnvironment predicates reflect the built host's environment", async () => {
  const builder = new HostBuilder();
  builder.configureHostConfiguration((config) => {
    config.add(new MemoryConfigurationSource({ initialData: { environment: "Development" } }));
  });

  const host = builder.build();
  const environment = host.services.resolve<IHostEnvironment>(HOST_ENVIRONMENT_TOKEN);

  expect(environment.environmentName).toBe("Development");
  // The fluent method form is installed onto HostingEnvironment by @rhombus-std/hosting.
  expect(environment.isDevelopment()).toBe(true);
  expect(environment.isProduction()).toBe(false);

  await host.start();
  await host.stop();
  host[Symbol.dispose]();
});

test("host configuration values flow into the application configuration (chained, not snapshotted)", () => {
  const builder = new HostBuilder();
  builder.configureHostConfiguration((config) => {
    config.add(new MemoryConfigurationSource({ initialData: { "Custom:Key": "fromHost" } }));
  });

  // Observed from inside the configureAppConfiguration callback -- by this
  // point the host configuration has already been chained into the app
  // configuration builder, ahead of any user delegate.
  let seenDuringCompose: string | undefined;
  builder.configureAppConfiguration((_context, appConfig) => {
    seenDuringCompose = appConfig.build().get("Custom:Key");
  });

  builder.build();
  expect(seenDuringCompose).toBe("fromHost");
});

test("Host.createApplicationBuilder().build() produces a runnable IHost", async () => {
  const events: string[] = [];

  class Worker {
    public async start(): Promise<void> {
      events.push("start");
    }
    public async stop(): Promise<void> {
      events.push("stop");
    }
  }

  const builder = Host.createApplicationBuilder([]);
  expect(builder.environment).toBeDefined();
  expect(builder.configuration).toBeDefined();
  expect(builder.logging).toBeDefined();

  builder.services.addHostedService(Worker, [[]]);

  const host = builder.build();
  await host.start();
  expect(events).toEqual(["start"]);

  await host.stop();
  expect(events).toEqual(["start", "stop"]);

  host[Symbol.dispose]();
});
