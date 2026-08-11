import { DefaultManifest, Type } from '@rhombus-std/di.core';
import { BackgroundService, Environments, HostAbortedError, HostDefaults, HOSTED_SERVICE_TOKEN,
  hostedServiceCollectionToken, HostEnvironmentEnvAugmentations, type IHostedService,
  type IHostEnvironment } from '@rhombus-std/hosting.core/private/index';
// Side-effect: installs `addHostedService` onto di.core's Manifest.
import '@rhombus-std/hosting.core/private/index';
// Side-effect: installs `build` onto di.core's Manifest.
import '@rhombus-std/di';
import { NullFileProvider } from '@rhombus-std/fileproviders.core';
import type { Func } from '@rhombus-toolkit/func';
import { expect, test } from 'bun:test';

async function waitUntil(condition: Func<[], boolean>, description: string): Promise<void> {
  for (let spins = 0; spins < 100_000; spins++) {
    if (condition()) {
      return;
    }
    await Promise.resolve();
  }
  throw new Error(`Timed out waiting for ${description}.`);
}

test('entry point loads and exposes the abstractions surface', () => {
  expect(Environments.Development).toBe('Development');
  expect(HostDefaults.environmentKey).toBe('environment');
  expect(HostDefaults.applicationKey).toBe('applicationName');
  expect(new HostAbortedError()).toBeInstanceOf(Error);
  expect(typeof BackgroundService).toBe('function');
});

test('environment predicates compare case-insensitively', () => {
  // The literal fakes only the DATA surface. IHostEnvironment is an OPEN
  // augmentation receiver, so the interface also carries the isEnvironment/
  // isDevelopment/... method form -- installed (via the registry) only on the
  // downstream concrete HostingEnvironment, which this package doesn't ship --
  // hence the cast. The standalone member form under test needs no methods on
  // its receiver.
  const env = { environmentName: 'development', applicationName: 'app', contentRootPath: '/',
    contentRootFileProvider: new NullFileProvider() } as IHostEnvironment;
  expect(HostEnvironmentEnvAugmentations.isEnvironment(env, 'Development')).toBe(true);
  expect(HostEnvironmentEnvAugmentations.isDevelopment(env)).toBe(true);
  expect(HostEnvironmentEnvAugmentations.isProduction(env)).toBe(false);
  expect(HostEnvironmentEnvAugmentations.isStaging(env)).toBe(false);
});

test('BackgroundService.start kicks execute without awaiting; stop aborts the stopping signal', async () => {
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
        stoppingSignal.addEventListener('abort', () => {
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

test('BackgroundService[Symbol.dispose] unconditionally aborts the executing operation', async () => {
  let aborted = false;
  let executing = false;

  class Worker extends BackgroundService {
    protected override async execute(stoppingSignal: AbortSignal): Promise<void> {
      executing = true;
      await new Promise<void>((resolve) => {
        stoppingSignal.addEventListener('abort', () => {
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
  await waitUntil(() => executing, 'the background service to begin executing');
  worker[Symbol.dispose]();
  await worker.executeTask;
  expect(aborted).toBe(true);
});

test('addHostedService registers many under one token; the collection resolves all in order', async () => {
  const order: string[] = [];

  class A implements IHostedService {
    public async start(): Promise<void> {
      order.push('A');
    }
    public async stop(): Promise<void> {}
  }
  class B implements IHostedService {
    public async start(): Promise<void> {
      order.push('B');
    }
    public async stop(): Promise<void> {}
  }

  let manifest = new DefaultManifest();
  manifest = manifest.addHostedService(A, [[]]);
  manifest = manifest.addHostedService(B, [[]]);

  const provider = manifest.build();
  const scope = provider.createScope('singleton');
  const services: IHostedService[] = scope.getRequiredService(Type.from(hostedServiceCollectionToken()));

  expect(services).toHaveLength(2);
  for (const service of services) {
    await service.start(new AbortController().signal);
  }
  expect(order).toEqual(['A', 'B']);

  expect(scope.isService(HOSTED_SERVICE_TOKEN)).toBe(true);
});

test('the hosted-service collection resolves to an empty array when none are registered', () => {
  let manifest = new DefaultManifest();
  const provider = manifest.build();
  const scope = provider.createScope('singleton');
  const services: IHostedService[] = scope.getRequiredService(Type.from(hostedServiceCollectionToken()));
  expect(services).toEqual([]);
});
