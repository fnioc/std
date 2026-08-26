// Behaviour tests for the standard lifetime model: which scope keeps an instance, what a
// registration naming no lifetime meets, and what a singleton's own dependencies resolve from.
//
// The scope/lifetime system is unbuilt here — every describe below stays skipped rather than
// chased to green.

import { di, standard } from '@rhombus-std/di';
import { type IServiceProvider, LifetimeModelError, Registration, ScopeFactory, type StandardLifetime } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { describe, expect, test } from 'bun:test';

const COUNTER = Type.imported('Counter', 'app');
const HOLDER = Type.imported('Holder', 'app');

class Counter {}

class Holder {
  constructor(readonly counter: unknown) {}
}

/** A container whose only registration is {@link Counter} under `lifetime`. */
function buildProviderFor(lifetime: StandardLifetime): IServiceProvider {
  return di.usingLifetimeModel(standard())
    .configureServices(manifest => manifest.add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), lifetime))
    .build();
}

/** Opens a scope the way a user without the engine-typed provider does — through the published address. */
function openScope(provider: IServiceProvider): IServiceProvider {
  return (provider.resolve(ScopeFactory.address) as Func<[], IServiceProvider>)();
}

describe.skip('the model itself', () => {
  test('names itself, so a failure can say which model refused', () => {
    expect(standard().name).toBe('standard');
  });
});

describe.skip('singleton', () => {
  test('answers every ask with one instance', () => {
    const provider = buildProviderFor('singleton');
    expect(provider.resolve(COUNTER)).toBe(provider.resolve(COUNTER));
  });

  test('answers a scope with the very instance the root holds', () => {
    const provider = buildProviderFor('singleton');
    expect(openScope(provider).resolve(COUNTER)).toBe(provider.resolve(COUNTER));
  });
});

describe.skip('scoped', () => {
  test('answers every ask within one scope with the same instance', () => {
    const scope = openScope(buildProviderFor('scoped'));
    expect(scope.resolve(COUNTER)).toBe(scope.resolve(COUNTER));
  });

  test("never hands one scope another scope's instance", () => {
    const provider = buildProviderFor('scoped');
    expect(openScope(provider).resolve(COUNTER)).not.toBe(openScope(provider).resolve(COUNTER));
  });

  test('treats the root as a scope of its own', () => {
    const provider = buildProviderFor('scoped');
    expect(provider.resolve(COUNTER)).toBe(provider.resolve(COUNTER));
    expect(openScope(provider).resolve(COUNTER)).not.toBe(provider.resolve(COUNTER));
  });
});

describe.skip('transient', () => {
  test('constructs afresh for every ask', () => {
    const provider = buildProviderFor('transient');
    expect(provider.resolve(COUNTER)).not.toBe(provider.resolve(COUNTER));
  });

  test('never keeps an instance, in a scope or out of one', () => {
    const provider = buildProviderFor('transient');
    expect(openScope(provider).resolve(COUNTER)).not.toBe(provider.resolve(COUNTER));
  });
});

describe.skip('a registration naming no lifetime', () => {
  test('is refused, naming the model that had no reading for it', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(Registration.ctor<StandardLifetime>(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton')))
      .build();

    let caught: unknown;
    try {
      provider.resolve(COUNTER);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LifetimeModelError);
    expect(((caught as LifetimeModelError).cause as Error).message).toContain('standard');
  });
});

describe.skip('captivity', () => {
  test("a singleton's scoped dependency comes from the root, not the scope it was asked from", () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'singleton')
      )
      .build();

    const scope = openScope(provider);
    expect((scope.resolve(HOLDER) as Holder).counter).toBe(provider.resolve(COUNTER));
    expect((scope.resolve(HOLDER) as Holder).counter).not.toBe(scope.resolve(COUNTER));
  });
});

describe.skip('scope creation', () => {
  test('the published address resolves to a working scope opener', () => {
    const provider = buildProviderFor('scoped');
    const openChildScope = provider.resolve(ScopeFactory.address) as Func<[], IServiceProvider>;
    expect(openChildScope().resolve(COUNTER)).toBeInstanceOf(Counter);
  });

  test('a scope opened from inside a scope keeps its own instances', () => {
    const provider = buildProviderFor('scoped');
    const scope = openScope(provider);
    expect(openScope(scope).resolve(COUNTER)).not.toBe(scope.resolve(COUNTER));
  });
});
