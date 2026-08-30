// Startup validation (hosting integration): options marked with
// `validateOnStart` are forced during host start, before any hosted service
// runs. A failing registration aborts start (the reference Host order:
// IStartupValidator.Validate() runs after resolving hosted services, before
// StartingAsync); a passing one lets start proceed.
//
// Exercised through the real Host DI: the `validateOnStart` registration
// (merged in via `addMany`) registers the built-in IStartupValidator, and
// Host.start resolves and forces it.

import { getHostedServiceManifest, HostBuilder, HOSTED_SERVICE_TYPE } from '@rhombus-std/hosting';
import { OptionsValidationError } from '@rhombus-std/options';
import { getValidateManifest, getValidateOnStartManifest } from '@rhombus-std/options.augmentations';
import { Type } from '@rhombus-std/primitives';
// Installs the `addOptions` verb onto di.core's Manifest.
import '@rhombus-std/options.augmentations';
import { expect, test } from 'bun:test';

interface ServerOptions {
  port: number;
}

const OPTIONS_TYPE: Type = Type.from('test:ServerOptions');

test('a failing validateOnStart aborts host start before any hosted service runs', async () => {
  let started = false;

  class Worker {
    public async start(): Promise<void> {
      started = true;
    }
    public async stop(): Promise<void> {}
  }

  const builder = new HostBuilder();
  builder.configureServices((_context, services) => {
    services = services.addOptions(OPTIONS_TYPE, () => ({ port: 0 }));
    services = services.addMany(getValidateManifest(OPTIONS_TYPE, (o: ServerOptions) => o.port > 0, 'port must be positive'));
    services = services.addMany(getValidateOnStartManifest(OPTIONS_TYPE));
    services = services.addMany(getHostedServiceManifest(Worker, Type.ctor(HOSTED_SERVICE_TYPE, [[]])));
    return services;
  });

  const host = builder.build();

  await expect(host.start()).rejects.toThrow(OptionsValidationError);
  // Validation runs ahead of `start()`, so the worker never started.
  expect(started).toBe(false);

  await host.stop();
  host[Symbol.dispose]();
});

test('valid options let validateOnStart pass and the host starts normally', async () => {
  let started = false;

  class Worker {
    public async start(): Promise<void> {
      started = true;
    }
    public async stop(): Promise<void> {}
  }

  const builder = new HostBuilder();
  builder.configureServices((_context, services) => {
    services = services.addOptions(OPTIONS_TYPE, () => ({ port: 8080 }));
    services = services.addMany(getValidateManifest(OPTIONS_TYPE, (o: ServerOptions) => o.port > 0, 'port must be positive'));
    services = services.addMany(getValidateOnStartManifest(OPTIONS_TYPE));
    services = services.addMany(getHostedServiceManifest(Worker, Type.ctor(HOSTED_SERVICE_TYPE, [[]])));
    return services;
  });

  const host = builder.build();

  await host.start();
  expect(started).toBe(true);

  await host.stop();
  host[Symbol.dispose]();
});
