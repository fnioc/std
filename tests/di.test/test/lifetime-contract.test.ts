// The lifetime behavior contract: what installing the standard lifetime model makes true, stated
// as behavior — each entry holds under Microsoft.Extensions.DependencyInjection modulo naming.
// Scope validation is a separate addon, so its entries state both switch positions.

import { Builder, ScopeValidationError, standardLifetime, validateBuildability, validateScopes } from '@rhombus-std/di';
import { type IDisposableServiceProvider, type IServiceProvider, type IServiceScopeFactory, ManifestValidationError, ObjectDisposedError, type StandardLifetime } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const SCOPE_FACTORY = Type.imported('IServiceScopeFactory', '@rhombus-std/di.core');
const PROVIDER = Type.imported('IServiceProvider', '@rhombus-std/di.core');
const COUNTER = Type.imported('Counter', 'app');
const HOLDER = Type.imported('Holder', 'app');
const PAIR = Type.imported('Pair', 'app');

class Counter {
  disposed = 0;
  constructor(readonly order: string[] = [], readonly id = 'counter') {}
  [Symbol.dispose](): void {
    this.disposed++;
    this.order.push(this.id);
  }
}

class Holder {
  constructor(readonly counter: Counter) {}
}

class Pair {
  constructor(readonly first: Holder, readonly second: Holder) {}
}

function openScope(provider: IServiceProvider): IDisposableServiceProvider {
  return (provider.resolve(SCOPE_FACTORY) as IServiceScopeFactory).openScope();
}

/** A container over {@link Counter} alone, under `lifetime`, with or without scope validation. */
function counterProvider(lifetime: StandardLifetime, validate = false): IDisposableServiceProvider {
  const builder = validate ? Builder.useAddon(standardLifetime()).useAddon(validateScopes()) : Builder.useAddon(standardLifetime());
  return builder.withServices(m => m.add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), lifetime)).build();
}

/** {@link Counter} under `counter` consumed by {@link Holder} under `holder`, with or without scope validation. */
function holderProvider(counter: StandardLifetime, holder: StandardLifetime, validate = false): IDisposableServiceProvider {
  const builder = validate ? Builder.useAddon(standardLifetime()).useAddon(validateScopes()) : Builder.useAddon(standardLifetime());
  return builder
    .withServices(m =>
      m
        .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), counter)
        .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), holder)
    )
    .build();
}

describe('singleton', () => {
  test('one instance per container: every resolve and every injection site shares it', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'transient')
          .add(PAIR, Pair, Type.ctor(PAIR, [[HOLDER, HOLDER]]), 'transient')
      )
      .build();
    const pair = provider.resolve(PAIR) as Pair;
    expect(pair.first.counter).toBe(pair.second.counter);
    expect(provider.resolve(COUNTER)).toBe(pair.first.counter);
  });

  test('constructed lazily, on the first resolve', () => {
    let built = 0;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m.add(COUNTER, () => {
          built++;
          return new Counter();
        }, Type.func(COUNTER, [[]]), 'singleton')
      )
      .build();
    expect(built).toBe(0);
    provider.resolve(COUNTER);
    expect(built).toBe(1);
  });

  test('a singleton factory runs once, however many resolves follow', () => {
    let built = 0;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m.add(COUNTER, () => {
          built++;
          return new Counter();
        }, Type.func(COUNTER, [[]]), 'singleton')
      )
      .build();
    provider.resolve(COUNTER);
    provider.resolve(COUNTER);
    openScope(provider).resolve(COUNTER);
    expect(built).toBe(1);
  });

  test('an instance handed to the registration is returned as-is and never constructed', () => {
    const instance = new Counter();
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.addValue(COUNTER, instance))
      .build();
    expect(provider.resolve(COUNTER)).toBe(instance);
    expect(openScope(provider).resolve(COUNTER)).toBe(instance);
  });

  test('resolving from a scope answers the container-wide instance', () => {
    const provider = counterProvider('singleton');
    expect(openScope(provider).resolve(COUNTER)).toBe(provider.resolve(COUNTER));
  });
});

describe('scoped', () => {
  test('one instance per scope, shared by everything resolved in that scope', () => {
    const provider = holderProvider('scoped', 'transient');
    const scope = openScope(provider);
    expect((scope.resolve(HOLDER) as Holder).counter).toBe(scope.resolve(COUNTER));
    expect(scope.resolve(COUNTER)).toBe(scope.resolve(COUNTER));
  });

  test('two scopes get two instances', () => {
    const provider = counterProvider('scoped');
    expect(openScope(provider).resolve(COUNTER)).not.toBe(openScope(provider).resolve(COUNTER));
  });

  test('a nested scope gets its own instance, independent of its parent', () => {
    const provider = counterProvider('scoped');
    const outer = openScope(provider);
    const inner = openScope(outer);
    expect(inner.resolve(COUNTER)).not.toBe(outer.resolve(COUNTER));
  });

  test('resolving a scoped service from the root is refused while scope validation is on', () => {
    const provider = counterProvider('scoped', true);
    expect(() => provider.resolve(COUNTER)).toThrow(ScopeValidationError);
    expect(openScope(provider).resolve(COUNTER)).toBeInstanceOf(Counter);
  });

  test("with scope validation off, a scoped service resolved from the root behaves as the root scope's own", () => {
    const provider = counterProvider('scoped');
    const instance = provider.resolve(COUNTER) as Counter;
    expect(provider.resolve(COUNTER)).toBe(instance);
    provider[Symbol.dispose]();
    expect(instance.disposed).toBe(1);
  });
});

describe('transient', () => {
  test('a fresh instance per resolve and per injection site', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'transient')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'transient')
          .add(PAIR, Pair, Type.ctor(PAIR, [[HOLDER, HOLDER]]), 'transient')
      )
      .build();
    const pair = provider.resolve(PAIR) as Pair;
    expect(pair.first.counter).not.toBe(pair.second.counter);
    expect(provider.resolve(COUNTER)).not.toBe(provider.resolve(COUNTER));
  });

  test('a transient injected into a singleton is constructed once and kept with it', () => {
    const provider = holderProvider('transient', 'singleton');
    const holder = provider.resolve(HOLDER) as Holder;
    expect((openScope(provider).resolve(HOLDER) as Holder).counter).toBe(holder.counter);
    provider[Symbol.dispose]();
    expect(holder.counter.disposed).toBe(1);
  });
});

describe('captive dependencies', () => {
  test('a scoped service injected into a singleton is refused while scope validation is on', () => {
    const provider = holderProvider('scoped', 'singleton', true);
    expect(() => openScope(provider).resolve(HOLDER)).toThrow(ScopeValidationError);
    expect(() => provider.resolve(HOLDER)).toThrow(ScopeValidationError);
  });

  test("with scope validation off, the singleton captures the root scope's instance", () => {
    const provider = holderProvider('scoped', 'singleton');
    const scope = openScope(provider);
    const holder = scope.resolve(HOLDER) as Holder;
    expect(holder.counter).not.toBe(scope.resolve(COUNTER));
    expect(holder.counter).toBe(provider.resolve(COUNTER));
    expect((openScope(provider).resolve(HOLDER) as Holder).counter).toBe(holder.counter);
  });
});

describe('disposal', () => {
  test('disposing the container disposes the singletons it constructed, most recent first', () => {
    const order: string[] = [];
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, () => new Counter(order, 'first'), Type.func(COUNTER, [[]]), 'singleton')
          .add(HOLDER, () => new Counter(order, 'second'), Type.func(HOLDER, [[]]), 'singleton')
      )
      .build();
    provider.resolve(COUNTER);
    provider.resolve(HOLDER);
    provider[Symbol.dispose]();
    expect(order).toEqual(['second', 'first']);
  });

  test('disposing a scope disposes what that scope constructed, most recent first', () => {
    const order: string[] = [];
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, () => new Counter(order, 'first'), Type.func(COUNTER, [[]]), 'scoped')
          .add(HOLDER, () => new Counter(order, 'second'), Type.func(HOLDER, [[]]), 'scoped')
      )
      .build();
    const scope = openScope(provider);
    scope.resolve(COUNTER);
    scope.resolve(HOLDER);
    scope[Symbol.dispose]();
    expect(order).toEqual(['second', 'first']);
  });

  test('an instance handed to a registration is never disposed by the container', () => {
    const instance = new Counter();
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.addValue(COUNTER, instance))
      .build();
    provider.resolve(COUNTER);
    provider[Symbol.dispose]();
    expect(instance.disposed).toBe(0);
  });

  test('transient disposables constructed in a scope are disposed with the scope', () => {
    const provider = counterProvider('transient');
    const scope = openScope(provider);
    const instance = scope.resolve(COUNTER) as Counter;
    scope[Symbol.dispose]();
    expect(instance.disposed).toBe(1);
  });

  test('async disposal settles async products; sync disposal of an async-only product refuses', async () => {
    class AsyncOnly {
      disposed = 0;
      async [Symbol.asyncDispose](): Promise<void> {
        this.disposed++;
      }
    }
    const build = () =>
      Builder.useAddon(standardLifetime())
        .withServices(m => m.add(COUNTER, AsyncOnly, Type.ctor(COUNTER, [[]]), 'singleton'))
        .build();

    const settled = build();
    const instance = settled.resolve(COUNTER) as AsyncOnly;
    await settled[Symbol.asyncDispose]();
    expect(instance.disposed).toBe(1);

    const refused = build();
    const other = refused.resolve(COUNTER) as AsyncOnly;
    expect(() => refused[Symbol.dispose]()).toThrow('Symbol.asyncDispose');
    expect(other.disposed).toBe(0);
  });

  test('resolving from a disposed scope or container refuses', () => {
    const provider = counterProvider('transient');
    const scope = openScope(provider);
    scope[Symbol.dispose]();
    expect(() => scope.resolve(COUNTER)).toThrow(ObjectDisposedError);
    provider.resolve(COUNTER);
    provider[Symbol.dispose]();
    expect(() => provider.resolve(COUNTER)).toThrow(ObjectDisposedError);
  });

  test('opening a scope from a disposed container refuses', () => {
    const provider = counterProvider('transient');
    const factory = provider.resolve(SCOPE_FACTORY) as IServiceScopeFactory;
    provider[Symbol.dispose]();
    expect(() => factory.openScope()).toThrow(ObjectDisposedError);
  });
});

describe('scopes', () => {
  test('the scope opener is resolvable from the root and from any scope', () => {
    const provider = counterProvider('scoped');
    const factory = provider.resolve(SCOPE_FACTORY) as IServiceScopeFactory;
    const scope = factory.openScope();
    expect(scope.resolve(SCOPE_FACTORY)).toBe(factory);
    expect(openScope(scope).resolve(SCOPE_FACTORY)).toBe(factory);
  });

  test("the provider resolved inside a scope is that scope's own", () => {
    const provider = counterProvider('scoped');
    const scope = openScope(provider);
    expect(scope.resolve(PROVIDER)).toBe(scope);
  });

  test("sibling scopes never see each other's instances", () => {
    const provider = counterProvider('scoped');
    const a = openScope(provider);
    const b = openScope(provider);
    expect(a.resolve(COUNTER)).not.toBe(b.resolve(COUNTER));
    expect(a.resolve(COUNTER)).toBe(a.resolve(COUNTER));
  });
});

describe('collections under lifetimes', () => {
  test("each element of a collection honors its own registration's lifetime", () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton')
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'transient')
      )
      .build();
    const first = Array.from(provider.resolveMany(COUNTER)) as Counter[];
    const second = Array.from(provider.resolveMany(COUNTER)) as Counter[];
    expect(first[0]).toBe(second[0]);
    expect(first[1]).not.toBe(second[1]);
  });
});

describe('build-time validation', () => {
  test('with build validation on, an unbuildable registration fails the build, every failure reported together', () => {
    const MISSING = Type.imported('Missing', 'app');
    // The chain folds innermost first, so the build-time plan runs under the captive check only
    // when validateBuildability is composed ahead of validateScopes.
    const build = () =>
      Builder.useAddon(validateBuildability())
        .useAddon(validateScopes())
        .useAddon(standardLifetime())
        .withServices(m =>
          m
            .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
            .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'singleton')
            .add(PAIR, Pair, Type.ctor(PAIR, [[MISSING, HOLDER]]), 'transient')
        )
        .build();

    let caught: unknown;
    try {
      build();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ManifestValidationError);
    const failures = (caught as ManifestValidationError).failures;
    expect(failures.map(failure => Type.stringify(failure.address)).sort()).toEqual(['app:Holder', 'app:Pair']);
    expect(failures.find(failure => failure.address === HOLDER)?.error).toBeInstanceOf(ScopeValidationError);
  });
});
