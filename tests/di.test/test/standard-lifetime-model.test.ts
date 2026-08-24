// Behaviour tests for the standard lifetime model: which scope keeps an instance, what a
// registration naming no lifetime meets, and what a singleton's own dependencies resolve from.
// The model is not on the package barrel yet, so it is reached white-box, at the source path it
// lives on.

import { di } from '@rhombus-std/di';
import { type IServiceProvider, LifetimeModelError, ScopeFactory, ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import type { Func } from '@rhombus-toolkit/func';
import { describe, expect, test } from 'bun:test';
import { standard, type StandardLifetime } from '../../../libraries/di.core/src/LifetimeModel/models/standard';

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
  return (provider.getService(ScopeFactory.address) as Func<[], IServiceProvider>)();
}

describe('the model itself', () => {
  test('names itself, so a failure can say which model refused', () => {
    expect(standard().name).toBe('standard');
  });
});

describe('singleton', () => {
  test('answers every ask with one instance', () => {
    const provider = buildProviderFor('singleton');
    expect(provider.getService(COUNTER)).toBe(provider.getService(COUNTER));
  });

  test('answers a scope with the very instance the root holds', () => {
    const provider = buildProviderFor('singleton');
    expect(openScope(provider).getService(COUNTER)).toBe(provider.getService(COUNTER));
  });
});

describe('scoped', () => {
  test('answers every ask within one scope with the same instance', () => {
    const scope = openScope(buildProviderFor('scoped'));
    expect(scope.getService(COUNTER)).toBe(scope.getService(COUNTER));
  });

  test("never hands one scope another scope's instance", () => {
    const provider = buildProviderFor('scoped');
    expect(openScope(provider).getService(COUNTER)).not.toBe(openScope(provider).getService(COUNTER));
  });

  test('treats the root as a scope of its own', () => {
    const provider = buildProviderFor('scoped');
    expect(provider.getService(COUNTER)).toBe(provider.getService(COUNTER));
    expect(openScope(provider).getService(COUNTER)).not.toBe(provider.getService(COUNTER));
  });
});

describe('transient', () => {
  test('constructs afresh for every ask', () => {
    const provider = buildProviderFor('transient');
    expect(provider.getService(COUNTER)).not.toBe(provider.getService(COUNTER));
  });

  test('never keeps an instance, in a scope or out of one', () => {
    const provider = buildProviderFor('transient');
    expect(openScope(provider).getService(COUNTER)).not.toBe(provider.getService(COUNTER));
  });
});

describe('a registration naming no lifetime', () => {
  test('is refused, naming the model that had no reading for it', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(ServiceDescriptor.ctor<StandardLifetime>(COUNTER, Counter, Type.ctor(COUNTER, [[]]))))
      .build();

    let caught: unknown;
    try {
      provider.getService(COUNTER);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LifetimeModelError);
    expect(((caught as LifetimeModelError).cause as Error).message).toContain('standard');
  });
});

describe('captivity', () => {
  test("a singleton's scoped dependency comes from the root, not the scope it was asked from", () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'singleton')
      )
      .build();

    const scope = openScope(provider);
    expect((scope.getService(HOLDER) as Holder).counter).toBe(provider.getService(COUNTER));
    expect((scope.getService(HOLDER) as Holder).counter).not.toBe(scope.getService(COUNTER));
  });
});

describe('scope creation', () => {
  test('the published address resolves to a working scope opener', () => {
    const provider = buildProviderFor('scoped');
    const openChildScope = provider.getService(ScopeFactory.address) as Func<[], IServiceProvider>;
    expect(openChildScope().getService(COUNTER)).toBeInstanceOf(Counter);
  });

  test('a scope opened from inside a scope keeps its own instances', () => {
    const provider = buildProviderFor('scoped');
    const scope = openScope(provider);
    expect(openScope(scope).getService(COUNTER)).not.toBe(scope.getService(COUNTER));
  });
});
