import {
  BackgroundService,
  Environments,
  HostAbortedException,
  HostDefaults,
  HOSTED_SERVICE_TOKEN,
  hostedServiceCollectionToken,
  HostEnvironmentEnvExtensions,
} from "@rhombus-std/hosting.core/internal/index";
// Side-effect: installs `addHostedService` onto di.core's ServiceManifest.
import "@rhombus-std/hosting.core/internal/index";
import { ServiceManifest } from "@rhombus-std/di";
import { NullFileProvider } from "@rhombus-std/fileproviders.core";
import type { IHostedService, IHostEnvironment } from "@rhombus-std/hosting.core/internal/index";
import { expect, test } from "bun:test";

test("entry point loads and exposes the abstractions surface", () => {
  expect(Environments.Development).toBe("Development");
  expect(HostDefaults.environmentKey).toBe("environment");
  expect(HostDefaults.applicationKey).toBe("applicationName");
  expect(new HostAbortedException()).toBeInstanceOf(Error);
  expect(typeof BackgroundService).toBe("function");
});

test("environment predicates compare case-insensitively", () => {
  // The literal fakes only the DATA surface. IHostEnvironment is an OPEN
  // augmentation receiver, so the interface also carries the isEnvironment/
  // isDevelopment/... method form -- installed (via the registry) only on the
  // downstream concrete HostingEnvironment, which this package doesn't ship --
  // hence the cast. The standalone member form under test needs no methods on
  // its receiver.
  const env = {
    environmentName: "development",
    applicationName: "app",
    contentRootPath: "/",
    contentRootFileProvider: new NullFileProvider(),
  } as IHostEnvironment;
  expect(HostEnvironmentEnvExtensions.isEnvironment(env, "Development")).toBe(true);
  expect(HostEnvironmentEnvExtensions.isDevelopment(env)).toBe(true);
  expect(HostEnvironmentEnvExtensions.isProduction(env)).toBe(false);
  expect(HostEnvironmentEnvExtensions.isStaging(env)).toBe(false);
});

test("BackgroundService.start kicks execute without awaiting; stop aborts the stopping signal", async () => {
  let sawAbort = false;
  let started = false;

  class Worker extends BackgroundService {
    protected override async execute(stoppingSignal: AbortSignal): Promise<void> {
      started = true;
      await new Promise<void>((resolve) => {
        if (stoppingSignal.aborted) {
          sawAbort = true;
          resolve();
          return;
        }
        stoppingSignal.addEventListener("abort", () => {
          sawAbort = true;
          resolve();
        }, { once: true });
      });
    }
  }

  const worker = new Worker();
  const controller = new AbortController();

  // start() must resolve immediately, without waiting on execute().
  await worker.start(controller.signal);
  expect(started).toBe(true);
  expect(sawAbort).toBe(false);

  await worker.stop(controller.signal);
  expect(sawAbort).toBe(true);
});

test("BackgroundService[Symbol.dispose] unconditionally aborts the executing operation", async () => {
  let aborted = false;
  let executing = false;

  class Worker extends BackgroundService {
    protected override async execute(stoppingSignal: AbortSignal): Promise<void> {
      executing = true;
      await new Promise<void>((resolve) => {
        stoppingSignal.addEventListener("abort", () => {
          aborted = true;
          resolve();
        }, { once: true });
      });
    }
  }

  const worker = new Worker();
  await worker.start(new AbortController().signal);
  // start() defers execute() through a microtask; wait for it to actually begin
  // running (and register its abort listener) before disposing.
  while (!executing) {
    await Promise.resolve();
  }
  worker[Symbol.dispose]();
  await worker.executeTask;
  expect(aborted).toBe(true);
});

test("addHostedService registers many under one token; the collection resolves all in order", async () => {
  const order: string[] = [];

  class A implements IHostedService {
    public async start(): Promise<void> {
      order.push("A");
    }
    public async stop(): Promise<void> {}
  }
  class B implements IHostedService {
    public async start(): Promise<void> {
      order.push("B");
    }
    public async stop(): Promise<void> {}
  }

  const manifest = new ServiceManifest();
  manifest.addHostedService(A, [[]]);
  manifest.addHostedService(B, [[]]);

  const provider = manifest.build();
  const scope = provider.createScope("singleton");
  const services = scope.resolve<IHostedService[]>(hostedServiceCollectionToken());

  expect(services).toHaveLength(2);
  for (const service of services) {
    await service.start(new AbortController().signal);
  }
  expect(order).toEqual(["A", "B"]);

  expect(scope.isService(HOSTED_SERVICE_TOKEN)).toBe(true);
});

test("the hosted-service collection resolves to an empty array when none are registered", () => {
  const manifest = new ServiceManifest();
  const provider = manifest.build();
  const scope = provider.createScope("singleton");
  const services = scope.resolve<IHostedService[]>(hostedServiceCollectionToken());
  expect(services).toEqual([]);
});
