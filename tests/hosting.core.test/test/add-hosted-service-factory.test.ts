import { ServiceManifest } from '@rhombus-std/di';
import { hostedServiceCollectionToken, type IHostedService } from '@rhombus-std/hosting.core/private/index';
// Side-effect: installs `addHostedService` onto di.core's ServiceManifest.
import '@rhombus-std/hosting.core/private/index';
import { expect, test } from 'bun:test';

test("addHostedService(factory) registers the factory's result under the hosted-service token", async () => {
  const started: string[] = [];

  class Worker implements IHostedService {
    public async start(): Promise<void> {
      started.push('worker');
    }
    public async stop(): Promise<void> {}
  }

  let manifest = new ServiceManifest();
  const singleton = new Worker();
  // The factory form surfaces an already-constructed instance as a hosted service.
  manifest = manifest.addHostedService(() => singleton);

  const provider = manifest.build();
  const scope = provider.createScope('singleton');
  const services = scope.resolve<IHostedService[]>(hostedServiceCollectionToken());

  expect(services).toHaveLength(1);
  expect(services[0]).toBe(singleton);

  await services[0]!.start(new AbortController().signal);
  expect(started).toEqual(['worker']);
});

test('addHostedService(factory) injects the live resolver so the factory can pull another registration', () => {
  class Dependency implements IHostedService {
    public async start(): Promise<void> {}
    public async stop(): Promise<void> {}
  }

  let manifest = new ServiceManifest();
  manifest = manifest.add('test:Dependency', Dependency, [[]]);
  // The factory receives the resolver -- the reference `Func<IServiceProvider, T>`
  // form used to promote a separately-registered service to a hosted service.
  manifest = manifest.addHostedService((resolver) => resolver.resolve<Dependency>('test:Dependency'));

  const provider = manifest.build();
  const scope = provider.createScope('singleton');
  const services = scope.resolve<IHostedService[]>(hostedServiceCollectionToken());

  expect(services).toHaveLength(1);
  expect(services[0]).toBeInstanceOf(Dependency);
});

test('addHostedService(ctor) and addHostedService(factory) coexist under the shared token', async () => {
  const started: string[] = [];

  class CtorWorker implements IHostedService {
    public async start(): Promise<void> {
      started.push('ctor');
    }
    public async stop(): Promise<void> {}
  }
  class FactoryWorker implements IHostedService {
    public async start(): Promise<void> {
      started.push('factory');
    }
    public async stop(): Promise<void> {}
  }

  let manifest = new ServiceManifest();
  manifest = manifest.addHostedService(CtorWorker, [[]]);
  manifest = manifest.addHostedService(() => new FactoryWorker());

  const provider = manifest.build();
  const scope = provider.createScope('singleton');
  const services = scope.resolve<IHostedService[]>(hostedServiceCollectionToken());

  expect(services).toHaveLength(2);
  for (const service of services) {
    await service.start(new AbortController().signal);
  }
  expect(started).toEqual(['ctor', 'factory']);
});
