import { ActivatorUtilities, RESOLVER_TOKEN, ServiceManifest } from '@rhombus-std/di';
import type { IResolver } from '@rhombus-std/di';
import { ActivationError } from '@rhombus-std/di.core';
import { describe, expect, test } from 'bun:test';
import { T } from './fixtures.js';

// `ActivatorUtilities` — activate an UNREGISTERED class against a provider,
// injecting its dependency-signature slots and drawing provider-unsatisfiable
// slots from supplied arguments. Deps hand-fed as a single `DepSlot[]` signature.

class Logger {
  public readonly kind = 'log';
}

/** Ctor mixing an injected dep (Logger) with a caller-supplied `name`. */
class Greeter {
  public constructor(
    public readonly logger: Logger,
    public readonly name: string,
  ) {}
}

/** Ctor taking the provider itself (a `IResolver`-typed parameter). */
class NeedsProvider {
  public constructor(public readonly resolver: IResolver) {}
}

const NAME_TOKEN = 'pkg:name' as const;

function providerWithLogger(): IResolver {
  const services = new ServiceManifest<'singleton'>();
  services.add(T.Logger, Logger); // transient — resolvable on the frameless provider
  return services.build();
}

describe('createInstance', () => {
  test('injects a registered dependency from the provider', () => {
    const provider = providerWithLogger();
    const greeter = ActivatorUtilities.createInstance(
      provider,
      Greeter,
      [T.Logger, NAME_TOKEN],
      'hello',
    ) as Greeter;

    expect(greeter).toBeInstanceOf(Greeter);
    expect(greeter.logger).toBeInstanceOf(Logger);
    expect(greeter.name).toBe('hello');
  });

  test('draws a provider-unsatisfiable slot from the supplied arguments', () => {
    const provider = providerWithLogger();
    // The unregistered NAME_TOKEN slot is filled by the supplied "world".
    const greeter = ActivatorUtilities.createInstance(
      provider,
      Greeter,
      [T.Logger, NAME_TOKEN],
      'world',
    ) as Greeter;
    expect(greeter.name).toBe('world');
  });

  test('injects the provider itself for an intrinsic provider-token slot', () => {
    const provider = providerWithLogger();
    const instance = ActivatorUtilities.createInstance(
      provider,
      NeedsProvider,
      [RESOLVER_TOKEN],
    ) as NeedsProvider;

    expect(instance.resolver.resolve<Logger>(T.Logger)).toBeInstanceOf(Logger);
  });

  test('a zero-argument class needs no signature', () => {
    const provider = providerWithLogger();
    const logger = ActivatorUtilities.createInstance(provider, Logger) as Logger;
    expect(logger).toBeInstanceOf(Logger);
  });

  test('throws ActivationError when a slot is neither resolvable nor supplied', () => {
    const provider = providerWithLogger();
    expect(() => ActivatorUtilities.createInstance(provider, Greeter, [T.Logger, NAME_TOKEN])).toThrow(ActivationError);
  });
});

describe('createFactory', () => {
  test('returns a reusable factory that builds a fresh instance per call', () => {
    const provider = providerWithLogger();
    const factory = ActivatorUtilities.createFactory<Greeter>(Greeter, [
      T.Logger,
      NAME_TOKEN,
    ]);

    const a = factory(provider, ['a']);
    const b = factory(provider, ['b']);

    expect(a).toBeInstanceOf(Greeter);
    expect(a.name).toBe('a');
    expect(b.name).toBe('b');
    expect(a).not.toBe(b);
  });

  test('a signature-less factory passes its arguments positionally', () => {
    const provider = providerWithLogger();
    const factory = ActivatorUtilities.createFactory<Greeter>(Greeter);
    const g = factory(provider, [new Logger(), 'direct']);
    expect(g.logger).toBeInstanceOf(Logger);
    expect(g.name).toBe('direct');
  });
});

describe('getServiceOrCreateInstance', () => {
  test('returns the registered service when the token resolves', () => {
    const sentinel = new Logger();
    const services = new ServiceManifest<'singleton'>();
    services.addValue(T.Logger, sentinel);
    const provider = services.build();

    const got = ActivatorUtilities.getServiceOrCreateInstance(provider, T.Logger, Logger);
    expect(got).toBe(sentinel);
  });

  test('activates the class when the token is unregistered', () => {
    const provider = providerWithLogger();
    const created = ActivatorUtilities.getServiceOrCreateInstance(
      provider,
      'pkg:unregistered',
      Logger,
    );
    expect(created).toBeInstanceOf(Logger);
  });
});
