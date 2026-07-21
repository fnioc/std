// Startup validation (hosting integration): options marked with
// `validateOnStart` are forced during host start, before any hosted service
// runs. A failing registration aborts start (the reference Host order:
// IStartupValidator.Validate() runs after resolving hosted services, before
// StartingAsync); a passing one lets start proceed.
//
// Exercised through the real Host DI: the `validateOnStart` augmentation
// registers the built-in IStartupValidator, and Host.start resolves and forces
// it. `@rhombus-std/options.augmentations` is a side-effect import so the
// `addOptions`/`validate`/`validateOnStart` manifest verbs are installed.

import { HostBuilder } from '@rhombus-std/hosting/private/index';
import { OptionsValidationError } from '@rhombus-std/options';
import '@rhombus-std/options.augmentations';
import { expect, test } from 'bun:test';

interface ServerOptions {
  port: number;
}

const OPTIONS_TOKEN = 'test:ServerOptions';

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
    services = services.addOptions<ServerOptions>(OPTIONS_TOKEN, () => ({ port: 0 })).as('singleton');
    services = services.validate<ServerOptions>(OPTIONS_TOKEN, (o) => o.port > 0, 'port must be positive');
    services = services.validateOnStart(OPTIONS_TOKEN);
    services = services.addHostedService(Worker, [[]]);
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
    services = services.addOptions<ServerOptions>(OPTIONS_TOKEN, () => ({ port: 8080 })).as('singleton');
    services = services.validate<ServerOptions>(OPTIONS_TOKEN, (o) => o.port > 0, 'port must be positive');
    services = services.validateOnStart(OPTIONS_TOKEN);
    services = services.addHostedService(Worker, [[]]);
    return services;
  });

  const host = builder.build();

  await host.start();
  expect(started).toBe(true);

  await host.stop();
  host[Symbol.dispose]();
});
