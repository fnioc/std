import { di } from '@rhombus-std/di';
import { LifetimeModel, Manifest, Type } from '@rhombus-std/di.core';
import { getHostedServiceManifest, HOSTED_SERVICE_TYPE, hostedServiceCollectionType, type IHostedService } from '@rhombus-std/hosting.core/private/index';
import { expect, test } from 'bun:test';

test("addHostedService(factory) registers the factory's result under the hosted-service token", async () => {
  const started: string[] = [];

  class Worker implements IHostedService {
    public async start(): Promise<void> {
      started.push('worker');
    }
    public async stop(): Promise<void> {}
  }

  let manifest: Manifest<unknown> = Manifest.empty<unknown>();
  const singleton = new Worker();
  // The factory form surfaces an already-constructed instance as a hosted service.
  manifest = manifest.addMany(getHostedServiceManifest(() => singleton));

  const provider = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(manifest).build();
  const services: IHostedService[] = provider.resolve(hostedServiceCollectionType());

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

  let manifest: Manifest<unknown> = Manifest.empty<unknown>();
  manifest = manifest.add(Type.from('test:Dependency'), Dependency, Type.ctor(Type.from('test:Dependency'), [[]]));
  // The factory receives the resolver -- the reference `Func<IServiceProvider, T>`
  // form used to promote a separately-registered service to a hosted service.
  manifest = manifest.addMany(getHostedServiceManifest((resolver) => {
    const dependency: Dependency = resolver.resolve(Type.from('test:Dependency'));
    return dependency;
  }));

  const provider = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(manifest).build();
  const services: IHostedService[] = provider.resolve(hostedServiceCollectionType());

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

  let manifest: Manifest<unknown> = Manifest.empty<unknown>();
  manifest = manifest.addMany(getHostedServiceManifest(CtorWorker, Type.ctor(HOSTED_SERVICE_TYPE, [[]])));
  manifest = manifest.addMany(getHostedServiceManifest(() => new FactoryWorker()));

  const provider = di.usingLifetimeModel(LifetimeModel.noop).usingManifest(manifest).build();
  const services: IHostedService[] = provider.resolve(hostedServiceCollectionType());

  expect(services).toHaveLength(2);
  for (const service of services) {
    await service.start(new AbortController().signal);
  }
  expect(started).toEqual(['ctor', 'factory']);
});
