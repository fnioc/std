// Baseline coverage across the container's core capabilities: the three registration doors,
// aggregate reads, latebound invocation, the async boundary, provider self-injection, open
// registrations, and union resolution.

import { Builder } from '@rhombus-std/di';
import { type IServiceProvider, Manifest, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

/** Seals `manifest` into a provider with no lifetime model: every ask constructs afresh. */
function toProvider(manifest: Manifest<unknown>): IServiceProvider {
  return Builder.withServices(() => manifest).build();
}

const CLOCK = Type.imported('Clock', 'app');
const REPO = Type.imported('Repo', 'app');
const GREETER = Type.imported('Greeter', 'app');
const CONFIG = Type.imported('Config', 'app');
const SINK = Type.imported('Sink', 'app');
const HANDLER = Type.imported('Handler', 'app');
const DESCRIPTION = Type.imported('Description', 'app');
const AWARE = Type.imported('ProviderAware', 'app');
const EMAIL = Type.imported('Email', 'app');
const SMS = Type.imported('Sms', 'app');
const NOTIFIER = Type.imported('Notifier', 'app');
const SERVICE_PROVIDER = Type.imported('IServiceProvider', '@rhombus-std/di.core');
const T = Type.generic('T');

const box = (of: Type) => Type.imported('Box', 'app', [of]);

class Clock {
  now(): number {
    return 0;
  }
}

class Repo {
  constructor(readonly clock: Clock) {}
}

class Greeter {
  greet(): string {
    return 'hello';
  }
}

class ConsoleSink {}

class FileSink {}

class Handler {
  constructor(readonly clock: Clock) {}
}

class ProviderAware {
  constructor(readonly provider: IServiceProvider) {}
}

class EmailChannel {}

class Notifier {
  constructor(readonly channel: unknown) {}
}

class Box {
  constructor(readonly closing: Type) {}
}

function makeClock(): Clock {
  return new Clock();
}

function describeClock(clock: Clock): string {
  return `clock:${clock instanceof Clock}`;
}

describe('constructor registration', () => {
  test('resolves the constructed instance', () => {
    const manifest = Manifest.empty<unknown>().add(Registration.ctor(GREETER, Greeter, Type.ctor(GREETER, [[]])));
    expect(toProvider(manifest).resolve(GREETER)).toBeInstanceOf(Greeter);
  });

  test('feeds one registration into another that depends on it', () => {
    const manifest = Manifest.empty<unknown>()
      .add(Registration.ctor(CLOCK, Clock, Type.ctor(CLOCK, [[]])))
      .add(Registration.ctor(REPO, Repo, Type.ctor(REPO, [[CLOCK]])));
    const repo = toProvider(manifest).resolve(REPO) as Repo;
    expect(repo).toBeInstanceOf(Repo);
    expect(repo.clock).toBeInstanceOf(Clock);
  });
});

describe('factory registration', () => {
  test('resolves the value the factory returns', () => {
    const manifest = Manifest.empty<unknown>().add(Registration.factory(CLOCK, makeClock, Type.func(CLOCK, [[]])));
    expect(toProvider(manifest).resolve(CLOCK)).toBeInstanceOf(Clock);
  });
});

describe('value registration', () => {
  test('hands the registered value back untouched', () => {
    const config = { retries: 3 };
    const manifest = Manifest.empty<unknown>().addValue(CONFIG, config);
    expect(toProvider(manifest).resolve(CONFIG)).toBe(config);
  });
});

describe('aggregate resolution', () => {
  const manifest = Manifest.empty<unknown>()
    .add(Registration.ctor(SINK, ConsoleSink, Type.ctor(SINK, [[]])))
    .add(Registration.ctor(SINK, FileSink, Type.ctor(SINK, [[]])));

  test('resolveMany reads every registration for the address', () => {
    const sinks = [...toProvider(manifest).resolveMany(SINK)];
    expect(sinks).toHaveLength(2);
    expect(sinks.some(sink => sink instanceof ConsoleSink)).toBe(true);
    expect(sinks.some(sink => sink instanceof FileSink)).toBe(true);
  });

  test('Type.array reads the same aggregate as an array', () => {
    const sinks = toProvider(manifest).resolve(Type.array(SINK)) as unknown[];
    expect(Array.isArray(sinks)).toBe(true);
    expect(sinks).toHaveLength(2);
  });
});

describe('latebound resolution', () => {
  const manifest = Manifest.empty<unknown>().add(Registration.ctor(CLOCK, Clock, Type.ctor(CLOCK, [[]])));
  const provider = toProvider(manifest);

  test('resolve(ctorType, ctor) constructs the caller-supplied class from the manifest', () => {
    const handler = provider.resolve(Type.ctor(HANDLER, [[CLOCK]]), Handler);
    expect(handler).toBeInstanceOf(Handler);
    expect(handler.clock).toBeInstanceOf(Clock);
  });

  test('resolve(funcType, func) calls the caller-supplied function with resolved arguments', () => {
    const described = provider.resolve(Type.func(DESCRIPTION, [[CLOCK]]), describeClock);
    expect(described).toBe('clock:true');
  });
});

describe('the async boundary', () => {
  test('resolveAsync awaits a Promise<T> registration standing under a dependency', async () => {
    const manifest = Manifest.empty<unknown>()
      .addValue(Type.promise(CLOCK), Promise.resolve(new Clock()))
      .add(Registration.ctor(REPO, Repo, Type.ctor(REPO, [[CLOCK]])));
    const repo = await toProvider(manifest).resolveAsync(REPO) as Repo;
    expect(repo).toBeInstanceOf(Repo);
    expect(repo.clock).toBeInstanceOf(Clock);
  });
});

describe('IServiceProvider injection', () => {
  test('a dependency typed as IServiceProvider is handed a provider that answers the same manifest', () => {
    const manifest = Manifest.empty<unknown>()
      .add(Registration.ctor(AWARE, ProviderAware, Type.ctor(AWARE, [[SERVICE_PROVIDER]])))
      .add(Registration.ctor(CLOCK, Clock, Type.ctor(CLOCK, [[]])));
    const aware = toProvider(manifest).resolve(AWARE) as ProviderAware;
    expect(aware.provider.resolve(CLOCK)).toBeInstanceOf(Clock);
  });
});

describe('open registration', () => {
  test('a generic hole is closed by the type the request names', () => {
    const manifest = Manifest.empty<unknown>().add(Registration.ctor(box(T), Box, Type.ctor(box(T), [[T]])));
    const built = toProvider(manifest).resolve(box(CLOCK)) as Box;
    expect(built.closing).toBe(CLOCK);
  });
});

describe('union resolution', () => {
  test('a suppliable member answers a dependency on the union', () => {
    const manifest = Manifest.empty<unknown>()
      .add(Registration.ctor(NOTIFIER, Notifier, Type.ctor(NOTIFIER, [[Type.union(EMAIL, SMS)]])))
      .add(Registration.ctor(EMAIL, EmailChannel, Type.ctor(EMAIL, [[]])));
    const notifier = toProvider(manifest).resolve(NOTIFIER) as Notifier;
    expect(notifier.channel).toBeInstanceOf(EmailChannel);
  });
});
