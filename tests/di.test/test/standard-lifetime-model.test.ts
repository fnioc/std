// Behaviour tests for the standard lifetime model: which scope keeps an instance, what a
// registration naming no lifetime meets, and what a singleton's own dependencies resolve from.

import { di, standard, type StandardLifetime, StandardScopeFactory } from '@rhombus-std/di';
import { type IServiceProvider, LifetimeModelError, ManifestValidationError, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
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
  return (provider.resolve(StandardScopeFactory.address) as StandardScopeFactory).openScope();
}

describe('the model itself', () => {
  test('names itself, so a failure can say which model refused', () => {
    expect(standard().name).toBe('standard');
  });
});

describe('singleton', () => {
  test('answers every ask with one instance', () => {
    const provider = buildProviderFor('singleton');
    expect(provider.resolve(COUNTER)).toBe(provider.resolve(COUNTER));
  });

  test('answers a scope with the very instance the root holds', () => {
    const provider = buildProviderFor('singleton');
    expect(openScope(provider).resolve(COUNTER)).toBe(provider.resolve(COUNTER));
  });
});

describe('scoped', () => {
  test('answers every ask within one scope with the same instance', () => {
    const scope = openScope(buildProviderFor('scoped'));
    expect(scope.resolve(COUNTER)).toBe(scope.resolve(COUNTER));
  });

  test("never hands one scope another scope's instance", () => {
    const provider = buildProviderFor('scoped');
    expect(openScope(provider).resolve(COUNTER)).not.toBe(openScope(provider).resolve(COUNTER));
  });

  test('refuses a scoped ask at the root scope', () => {
    const provider = buildProviderFor('scoped');

    let caught: unknown;
    try {
      provider.resolve(COUNTER);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LifetimeModelError);
    expect(((caught as LifetimeModelError).cause as Error).name).toBe('ScopedAtRootError');
  });
});

describe('transient', () => {
  test('constructs afresh for every ask', () => {
    const provider = buildProviderFor('transient');
    expect(provider.resolve(COUNTER)).not.toBe(provider.resolve(COUNTER));
  });

  test('never keeps an instance, in a scope or out of one', () => {
    const provider = buildProviderFor('transient');
    expect(openScope(provider).resolve(COUNTER)).not.toBe(provider.resolve(COUNTER));
  });
});

describe('a registration naming no lifetime', () => {
  test('is refused, naming the model that had no reading for it', () => {
    const provider = di.usingLifetimeModel(standard())
      // The types forbid a lifetime-less registration on this model, so the cast is what reaches
      // the runtime guard an untyped caller would hit.
      .configureServices(manifest => manifest.add(Registration.ctor(COUNTER, Counter, Type.ctor(COUNTER, [[]])) as unknown as Registration<StandardLifetime>))
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

describe('captivity', () => {
  test('a singleton depending on a scoped registration is caught at build time by the default validator', () => {
    expect(() =>
      di.usingLifetimeModel(standard())
        .configureServices(manifest =>
          manifest
            .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
            .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'singleton')
        )
        .build()
    ).toThrow(ManifestValidationError);
  });

  test('with both checks off, a singleton depending on a scoped registration resolves — root keeps the scoped instance', () => {
    const provider = di.usingLifetimeModel(standard({ validateOnBuild: false, validateScopes: false }))
      .configureServices(manifest =>
        manifest
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'singleton')
      )
      .build();

    // The singleton is resolved through an opened scope, yet its scoped dependency threads under
    // root state: root keeps it, so the scope sees the very instance the root itself holds.
    const holder = openScope(provider).resolve(HOLDER) as Holder;
    expect(holder.counter).toBeInstanceOf(Counter);
    expect(holder.counter).toBe((provider.resolve(HOLDER) as Holder).counter);
  });
});

describe('the two validation switches', () => {
  test('are both on by default: the sweep catches a captive pair and the root refuses a scoped ask', () => {
    expect(() =>
      di.usingLifetimeModel(standard())
        .configureServices(manifest =>
          manifest
            .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
            .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'singleton')
        )
        .build()
    ).toThrow(ManifestValidationError);

    expect(() => buildProviderFor('scoped').resolve(COUNTER)).toThrow(LifetimeModelError);
  });

  test('validateScopes off keeps a scoped ask at the root — same instance on a second ask', () => {
    const provider = di.usingLifetimeModel(standard({ validateScopes: false }))
      .configureServices(manifest => manifest.add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped'))
      .build();

    const instance = provider.resolve(COUNTER);
    expect(instance).toBeInstanceOf(Counter);
    expect(provider.resolve(COUNTER)).toBe(instance);
  });

  test('validateOnBuild off drops the sweep while the runtime root refusal still fires', () => {
    const provider = di.usingLifetimeModel(standard({ validateOnBuild: false }))
      .configureServices(manifest =>
        manifest
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'singleton')
      )
      .build();

    let caught: unknown;
    try {
      provider.resolve(COUNTER);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LifetimeModelError);
    expect(((caught as LifetimeModelError).cause as Error).name).toBe('ScopedAtRootError');
  });
});

describe('scope creation', () => {
  test('the published address resolves to a working scope opener', () => {
    const provider = buildProviderFor('scoped');
    const factory = provider.resolve(StandardScopeFactory.address) as StandardScopeFactory;
    expect(factory.openScope().resolve(COUNTER)).toBeInstanceOf(Counter);
  });

  test('a scope opened from inside a scope keeps its own instances', () => {
    const provider = buildProviderFor('scoped');
    const scope = openScope(provider);
    expect(openScope(scope).resolve(COUNTER)).not.toBe(scope.resolve(COUNTER));
  });
});
