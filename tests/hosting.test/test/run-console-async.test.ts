import { CONSOLE_LIFETIME_OPTIONS_TOKEN, ConsoleLifetime, type ConsoleLifetimeOptions, HOST_LIFETIME_TOKEN, HostBuilder,
  type IHostLifetime } from '@rhombus-std/hosting/private/index';
import { expect, test } from 'bun:test';

// runConsoleAsync builds and starts the host internally, then blocks until
// shutdown. To observe it without a host handle, these tests register a probe
// hosted service (resolved during start) that captures what it sees, and drive
// shutdown through the abort signal the overloads accept.

test('runConsoleAsync (signal-only form) starts the host and shuts down when the signal aborts', async () => {
  const events: string[] = [];

  class Worker {
    public async start(): Promise<void> {
      events.push('start');
    }
    public async stop(): Promise<void> {
      events.push('stop');
    }
  }

  const builder = new HostBuilder();
  builder.configureServices((_context, services) => services.addHostedService(Worker, [[]]));

  const controller = new AbortController();
  const run = builder.runConsoleAsync(controller.signal);

  // Let the host reach a fully-started state before requesting shutdown.
  while (!events.includes('start')) {
    await Promise.resolve();
  }
  expect(events).toEqual(['start']);

  controller.abort();
  await run;

  expect(events).toEqual(['start', 'stop']);
});

test('runConsoleAsync (configureOptions form) applies the options, and they reach the console lifetime', async () => {
  let seenSuppress: boolean | undefined;
  let lifetimeIsConsole = false;

  const builder = new HostBuilder();
  builder.configureServices((_context, services) => {
    services = services.addHostedService((resolver) => {
      // The same options singleton is what the ConsoleLifetime constructor read,
      // so observing it here observes exactly what the lifetime holds.
      const options = resolver.resolve<ConsoleLifetimeOptions>(CONSOLE_LIFETIME_OPTIONS_TOKEN);
      const lifetime = resolver.resolve<IHostLifetime>(HOST_LIFETIME_TOKEN);
      return {
        async start(): Promise<void> {
          seenSuppress = options.suppressStatusMessages;
          lifetimeIsConsole = lifetime instanceof ConsoleLifetime;
        },
        async stop(): Promise<void> {},
      };
    });
    return services;
  });

  const controller = new AbortController();
  const run = builder.runConsoleAsync(
    (options) => {
      options.suppressStatusMessages = true;
    },
    controller.signal,
  );

  while (seenSuppress === undefined) {
    await Promise.resolve();
  }

  controller.abort();
  await run;

  // useConsoleLifetime installed the ConsoleLifetime (not the default
  // NullLifetime), and the configureOptions mutation reached it.
  expect(lifetimeIsConsole).toBe(true);
  expect(seenSuppress).toBe(true);
});

test('runConsoleAsync without a configureOptions delegate leaves the console lifetime at its defaults', async () => {
  let seenSuppress: boolean | undefined;

  const builder = new HostBuilder();
  builder.configureServices((_context, services) => {
    services = services.addHostedService((resolver) => {
      const options = resolver.resolve<ConsoleLifetimeOptions>(CONSOLE_LIFETIME_OPTIONS_TOKEN);
      return {
        async start(): Promise<void> {
          seenSuppress = options.suppressStatusMessages;
        },
        async stop(): Promise<void> {},
      };
    });
    return services;
  });

  const controller = new AbortController();
  const run = builder.runConsoleAsync(controller.signal);

  while (seenSuppress === undefined) {
    await Promise.resolve();
  }

  controller.abort();
  await run;

  expect(seenSuppress).toBe(false);
});

test('runConsoleAsync stays pending until the abort signal fires, then resolves', async () => {
  let started = false;

  class Worker {
    public async start(): Promise<void> {
      started = true;
    }
    public async stop(): Promise<void> {}
  }

  const builder = new HostBuilder();
  builder.configureServices((_context, services) => services.addHostedService(Worker, [[]]));

  const controller = new AbortController();
  const run = builder.runConsoleAsync(controller.signal);

  let settled = false;
  void run.then(() => {
    settled = true;
  });

  while (!started) {
    await Promise.resolve();
  }
  // Give any premature settle a chance to surface: the run must still be blocked
  // on shutdown even though the host is fully started.
  await Promise.resolve();
  expect(settled).toBe(false);

  controller.abort();
  await run;
  expect(settled).toBe(true);
});

test('runConsoleAsync propagates a throwing configureOptions delegate (host is never built)', () => {
  let servicesConfigured = false;

  const builder = new HostBuilder();
  builder.configureServices((_context, services) => {
    servicesConfigured = true;
    return services;
  });

  // The delegate runs synchronously inside useConsoleLifetime, before the host is
  // built or run, so the throw surfaces out of the call itself.
  expect(() =>
    builder.runConsoleAsync(() => {
      throw new Error('configure boom');
    })
  ).toThrow('configure boom');

  // The lifetime registration never ran, so nothing was configured on the builder.
  expect(servicesConfigured).toBe(false);
});
