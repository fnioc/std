import { Builder } from '@rhombus-std/di';
import { Manifest } from '@rhombus-std/di.core';
import { NullFileProvider } from '@rhombus-std/fileproviders.core';
import { BackgroundService, Environments, getHostedServiceManifest, HostAbortedError, HostDefaults, HOSTED_SERVICE_TYPE, hostedServiceCollectionType, HostEnvironmentEnvAugmentations,
  type IHostedService, type IHostEnvironment } from '@rhombus-std/hosting.core/private/index';
import { Type } from '@rhombus-std/primitives';
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
  const env = { environmentName: 'development', applicationName: 'app', contentRootPath: '/', contentRootFileProvider: new NullFileProvider() } as IHostEnvironment;
  expect(HostEnvironmentEnvAugmentations.isEnvironment.call(env, 'Development')).toBe(true);
  expect(HostEnvironmentEnvAugmentations.isDevelopment.call(env)).toBe(true);
  expect(HostEnvironmentEnvAugmentations.isProduction.call(env)).toBe(false);
  expect(HostEnvironmentEnvAugmentations.isStaging.call(env)).toBe(false);
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

  let manifest: Manifest<unknown> = Manifest.empty<unknown>();
  manifest = manifest.add(getHostedServiceManifest(A, Type.ctor(HOSTED_SERVICE_TYPE, [[]])));
  manifest = manifest.add(getHostedServiceManifest(B, Type.ctor(HOSTED_SERVICE_TYPE, [[]])));

  const provider = Builder.withServices(() => manifest).build();
  const services: IHostedService[] = provider.resolve(hostedServiceCollectionType());

  expect(services).toHaveLength(2);
  for (const service of services) {
    await service.start(new AbortController().signal);
  }
  expect(order).toEqual(['A', 'B']);
});

test('the hosted-service collection resolves to an empty array when none are registered', () => {
  const manifest: Manifest<unknown> = Manifest.empty<unknown>();
  const provider = Builder.withServices(() => manifest).build();
  const services: IHostedService[] = provider.resolve(hostedServiceCollectionType());
  expect(services).toEqual([]);
});
