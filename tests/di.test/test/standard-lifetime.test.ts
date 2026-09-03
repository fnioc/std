// Behaviour tests for the standard lifetime model: what each lifetime caches and where, how
// several registrations of one address and a collection ask meet the caches, what a failed or
// pending construction leaves behind, how scopes relate, and what the built-in registrations
// answer. Disposal and scope validation have suites of their own.

import { Builder, standardLifetime } from '@rhombus-std/di';
import { type Addon, type IServiceProvider, type IServiceScopeFactory, type Manifest, Registration, type Request, type StandardLifetime } from '@rhombus-std/di.core';
import { lifetimeKind, scopeId } from '@rhombus-std/di/private/addons/standard-lifetime/symbols';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const DI_CORE = '@rhombus-std/di.core';
const SCOPE_FACTORY = Type.imported('IServiceScopeFactory', DI_CORE);
const PROVIDER = Type.imported('IServiceProvider', DI_CORE);
const COUNTER = Type.imported('Counter', 'app');
const HOLDER = Type.imported('Holder', 'app');
const PAIR = Type.imported('Pair', 'app');
const T = Type.generic('T');
const box = (of: Type) => Type.imported('Box', 'app', [of]);

class Counter {}

class Holder {
  constructor(readonly counter: Counter) {}
}

class Pair {
  constructor(readonly first: Holder, readonly second: Holder) {}
}

class Box {
  constructor(readonly closing: unknown) {}
}

/** A container over {@link Counter} alone, under `lifetime`. */
function counterProvider(lifetime: StandardLifetime): IServiceProvider {
  return Builder.useAddon(standardLifetime())
    .withServices(m => m.add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), lifetime))
    .build();
}

function openScope(provider: IServiceProvider): IServiceProvider {
  return (provider.resolve(SCOPE_FACTORY) as IServiceScopeFactory).openScope();
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

  test('resolving from a scope answers the container-wide instance', () => {
    const provider = counterProvider('singleton');
    expect(openScope(provider).resolve(COUNTER)).toBe(provider.resolve(COUNTER));
    expect(openScope(provider).resolve(COUNTER)).toBe(openScope(provider).resolve(COUNTER));
  });

  test('a singleton first reached from a scope is the very instance the container then answers', () => {
    const provider = counterProvider('singleton');
    const fromScope = openScope(provider).resolve(COUNTER);
    expect(provider.resolve(COUNTER)).toBe(fromScope);
  });
});

describe('scoped', () => {
  test('one instance per scope, shared by everything resolved in that scope', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'transient')
      )
      .build();
    const scope = openScope(provider);

    const holder = scope.resolve(HOLDER) as Holder;
    expect(scope.resolve(COUNTER)).toBe(holder.counter);
    expect((scope.resolve(HOLDER) as Holder).counter).toBe(holder.counter);
  });

  test('two scopes get two instances', () => {
    const provider = counterProvider('scoped');
    expect(openScope(provider).resolve(COUNTER)).not.toBe(openScope(provider).resolve(COUNTER));
  });

  test('a scope opened from inside a scope gets its own instance, independent of the opener', () => {
    const provider = counterProvider('scoped');
    const outer = openScope(provider);
    const inner = openScope(outer);
    expect(inner.resolve(COUNTER)).not.toBe(outer.resolve(COUNTER));
    expect(inner.resolve(COUNTER)).toBe(inner.resolve(COUNTER));
  });

  test('a wide scoped tree resolves: every one of twelve scoped siblings is shared within a scope and fresh in another', () => {
    const WIDE = Type.imported('Wide', 'app');
    const SIBLINGS = Array.from({ length: 12 }, (_, i) => Type.imported(`Sibling${i}`, 'app'));
    class Sibling {}
    class Wide {
      readonly siblings: Sibling[];
      constructor(...siblings: Sibling[]) {
        this.siblings = siblings;
      }
    }
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        SIBLINGS
          .reduce((manifest: Manifest<StandardLifetime>, sibling) => manifest.add(sibling, Sibling, Type.ctor(sibling, [[]]), 'scoped'), m)
          .add(WIDE, Wide, Type.ctor(WIDE, [SIBLINGS]), 'scoped')
      )
      .build();
    const scope = openScope(provider);
    const other = openScope(provider);

    const wide = scope.resolve(WIDE) as Wide;
    expect(wide.siblings).toHaveLength(12);
    SIBLINGS.forEach((sibling, i) => {
      expect(wide.siblings[i]).toBeInstanceOf(Sibling);
      expect(scope.resolve(sibling)).toBe(wide.siblings[i]);
      expect(other.resolve(sibling)).not.toBe(wide.siblings[i]);
    });
    expect((other.resolve(WIDE) as Wide).siblings).toEqual(SIBLINGS.map(sibling => other.resolve(sibling)));
  });

  test("resolved from the container's own provider without validation, it is cached with the singletons for every later container ask", () => {
    const provider = counterProvider('scoped');
    const promoted = provider.resolve(COUNTER);

    expect(promoted).toBeInstanceOf(Counter);
    expect(provider.resolve(COUNTER)).toBe(promoted);
    expect(openScope(provider).resolve(COUNTER)).not.toBe(promoted);
  });

  test('a singleton consuming a scoped registration without validation captures the singleton-cached instance, from any provider', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'singleton')
      )
      .build();
    const scope = openScope(provider);

    const holder = scope.resolve(HOLDER) as Holder;
    expect(holder.counter).not.toBe(scope.resolve(COUNTER));
    expect(holder.counter).toBe(provider.resolve(COUNTER));
    expect(provider.resolve(HOLDER)).toBe(holder);
  });

  test("a scope's own instance is never promoted: the container's provider still constructs its own", () => {
    const provider = counterProvider('scoped');
    const scope = openScope(provider);
    const scoped = scope.resolve(COUNTER);

    expect(provider.resolve(COUNTER)).not.toBe(scoped);
    expect(scope.resolve(COUNTER)).toBe(scoped);
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
    expect(pair.first).not.toBe(pair.second);
    expect(pair.first.counter).not.toBe(pair.second.counter);
    expect(provider.resolve(COUNTER)).not.toBe(provider.resolve(COUNTER));
  });

  test('never kept, in a scope or out of one', () => {
    const provider = counterProvider('transient');
    const scope = openScope(provider);
    expect(scope.resolve(COUNTER)).not.toBe(scope.resolve(COUNTER));
    expect(scope.resolve(COUNTER)).not.toBe(provider.resolve(COUNTER));
  });

  test('a transient injected into a singleton is constructed once and kept with it', () => {
    let built = 0;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, () => {
            built++;
            return new Counter();
          }, Type.func(COUNTER, [[]]), 'transient')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'singleton')
      )
      .build();

    const holder = provider.resolve(HOLDER) as Holder;
    expect((openScope(provider).resolve(HOLDER) as Holder).counter).toBe(holder.counter);
    expect(built).toBe(1);
  });
});

describe('several registrations of one address', () => {
  test('a single ask answers the last registration, under its own lifetime alone', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton')
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'transient')
      )
      .build();

    expect(provider.resolve(COUNTER)).not.toBe(provider.resolve(COUNTER));
  });

  test('a single ask answers the last registration even when an earlier one is scoped and the ask comes from the container', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton')
      )
      .build();

    expect(provider.resolve(COUNTER)).toBe(provider.resolve(COUNTER));
  });

  test("a scoped last registration resolved from the container's provider is promoted, never the earlier singleton", () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton')
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
      )
      .build();

    const promoted = provider.resolve(COUNTER);
    expect(provider.resolve(COUNTER)).toBe(promoted);
    expect(Array.from(provider.resolveMany(COUNTER))[0]).not.toBe(promoted);
  });

  test('a collection ask answers every registration in registration order, each under its own lifetime', () => {
    const singleton = Registration.ctor<StandardLifetime>(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton');
    const transient = Registration.ctor<StandardLifetime>(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'transient');
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(singleton).add(transient))
      .build();

    const first = Array.from(provider.resolveMany(COUNTER)) as Counter[];
    const second = Array.from(provider.resolveMany(COUNTER)) as Counter[];
    expect(first).toHaveLength(2);
    expect(first[0]).toBe(second[0]);
    expect(first[1]).not.toBe(second[1]);
  });

  test('the last element of a collection ask is the very instance a single ask answers', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton')
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton')
      )
      .build();

    const all = Array.from(provider.resolveMany(COUNTER)) as Counter[];
    expect(all[0]).not.toBe(all[1]);
    expect(all[1]).toBe(provider.resolve(COUNTER));
  });

  test('a collection ask in a scope keeps scoped elements per scope and singleton elements per container', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton')
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
      )
      .build();
    const a = openScope(provider);
    const b = openScope(provider);

    const fromA = Array.from(a.resolveMany(COUNTER)) as Counter[];
    const fromB = Array.from(b.resolveMany(COUNTER)) as Counter[];
    expect(fromA[0]).toBe(fromB[0]);
    expect(fromA[1]).not.toBe(fromB[1]);
    expect(fromA[1]).toBe(a.resolve(COUNTER));
  });
});

describe('collection asks and registered arrays', () => {
  const COUNTERS = Type.array(COUNTER);

  test('a collection ask is fresh per ask: a new array every time, over the very instances each element registration answers', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton')
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton')
      )
      .build();

    const first = provider.resolve(COUNTERS) as Counter[];
    const second = provider.resolve(COUNTERS) as Counter[];
    expect(second).not.toBe(first);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });

  test("each element honours its own registration: a singleton element is shared across scopes, a scoped element is that scope's own", () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton')
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
      )
      .build();
    const a = openScope(provider);
    const b = openScope(provider);

    const fromA = a.resolve(COUNTERS) as Counter[];
    const fromB = b.resolve(COUNTERS) as Counter[];
    expect(fromB).not.toBe(fromA);
    expect(fromA[0]).toBe(fromB[0]);
    expect(fromA[1]).not.toBe(fromB[1]);
    expect(fromA[1]).toBe(a.resolve(COUNTER));
  });

  test('a registration answering the array address is one service under one lifetime, not a collection', () => {
    let made = 0;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'transient')
          .add(COUNTERS, () => {
            made++;
            return [new Counter(), new Counter()];
          }, Type.func(COUNTERS, [[]]), 'singleton')
      )
      .build();

    const registered = provider.resolve(COUNTERS) as Counter[];
    expect(provider.resolve(COUNTERS)).toBe(registered);
    expect(openScope(provider).resolve(COUNTERS)).toBe(registered);
    expect(made).toBe(1);
  });
});

describe('open registrations', () => {
  test('an open singleton is cached once per closing', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(box(T), Box, Type.ctor(box(T), [[T]]), 'singleton').add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'transient'))
      .build();

    const ofCounter = provider.resolve(box(COUNTER)) as Box;
    expect(provider.resolve(box(COUNTER))).toBe(ofCounter);
    expect(provider.resolve(box(box(COUNTER)))).not.toBe(ofCounter);
    expect(provider.resolve(box(box(COUNTER)))).toBe(provider.resolve(box(box(COUNTER))));
  });
});

describe('creation failure', () => {
  test('a singleton whose construction throws caches nothing, so the next ask constructs again', () => {
    let attempts = 0;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m.add(COUNTER, () => {
          attempts++;
          if (attempts === 1) {
            throw new Error('not yet');
          }
          return new Counter();
        }, Type.func(COUNTER, [[]]), 'singleton')
      )
      .build();

    expect(() => provider.resolve(COUNTER)).toThrow('not yet');
    expect(provider.resolve(COUNTER)).toBeInstanceOf(Counter);
    expect(attempts).toBe(2);
  });

  test('the original error surfaces from the resolve, not a wrapped one', () => {
    class Boom extends Error {}
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m.add(COUNTER, () => {
          throw new Boom('boom');
        }, Type.func(COUNTER, [[]]), 'scoped')
      )
      .build();

    expect(() => openScope(provider).resolve(COUNTER)).toThrow(Boom);
  });
});

describe('asynchronous constructions', () => {
  test('a scoped construction that throws caches nothing in the scope, so the next ask constructs again', () => {
    let attempts = 0;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m.add(COUNTER, () => {
          attempts++;
          if (attempts === 1) {
            throw new Error('not yet');
          }
          return new Counter();
        }, Type.func(COUNTER, [[]]), 'scoped')
      )
      .build();
    const scope = openScope(provider);

    expect(() => scope.resolve(COUNTER)).toThrow('not yet');
    expect(scope.resolve(COUNTER)).toBeInstanceOf(Counter);
    expect(scope.resolve(COUNTER)).toBe(scope.resolve(COUNTER));
    expect(attempts).toBe(2);
  });

  test('concurrent asks for a pending scoped construction share it, and a rejection is forgotten', async () => {
    let attempts = 0;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m.add(COUNTER, async () => {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 0));
          if (attempts === 1) {
            throw new Error('not yet');
          }
          return new Counter();
        }, Type.func(Type.promise(COUNTER), [[]]), 'scoped')
      )
      .build();
    const scope = openScope(provider);

    await expect(scope.resolveAsync(COUNTER)).rejects.toThrow('not yet');
    const [first, second] = await Promise.all([scope.resolveAsync(COUNTER), scope.resolveAsync(COUNTER)]);
    expect(first).toBe(second);
    expect(attempts).toBe(2);
  });

  test('concurrent asks for a pending singleton share one construction', async () => {
    let built = 0;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m.add(COUNTER, async () => {
          built++;
          await new Promise(resolve => setTimeout(resolve, 0));
          return new Counter();
        }, Type.func(Type.promise(COUNTER), [[]]), 'singleton')
      )
      .build();

    const [first, second] = await Promise.all([provider.resolveAsync(COUNTER), provider.resolveAsync(COUNTER)]);
    expect(first).toBe(second);
    expect(built).toBe(1);
  });

  test('a singleton whose construction rejects is forgotten, so the next ask constructs again', async () => {
    let attempts = 0;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m.add(COUNTER, async () => {
          attempts++;
          if (attempts === 1) {
            throw new Error('not yet');
          }
          return new Counter();
        }, Type.func(Type.promise(COUNTER), [[]]), 'singleton')
      )
      .build();

    await expect(provider.resolveAsync(COUNTER)).rejects.toThrow('not yet');
    expect(await provider.resolveAsync(COUNTER)).toBeInstanceOf(Counter);
    expect(attempts).toBe(2);
  });
});

describe('scopes', () => {
  test('the scope factory is resolvable from the container and from any scope, always the same instance', () => {
    const provider = counterProvider('scoped');
    const factory = provider.resolve(SCOPE_FACTORY) as IServiceScopeFactory;
    const scope = factory.openScope();

    expect(scope.resolve(SCOPE_FACTORY)).toBe(factory);
    expect((scope.resolve(SCOPE_FACTORY) as IServiceScopeFactory).openScope().resolve(SCOPE_FACTORY)).toBe(factory);
  });

  test('a scope opened through a factory resolved inside a scope is a child of the container, not of that scope', () => {
    const provider = counterProvider('scoped');
    const outer = openScope(provider);
    const inner = openScope(outer);
    expect(inner.resolve(COUNTER)).not.toBe(outer.resolve(COUNTER));
  });

  test("sibling scopes never see each other's instances", () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'scoped')
      )
      .build();
    const a = openScope(provider);
    const b = openScope(provider);

    expect(a.resolve(COUNTER)).not.toBe(b.resolve(COUNTER));
    expect((a.resolve(HOLDER) as Holder).counter).toBe(a.resolve(COUNTER));
    expect((b.resolve(HOLDER) as Holder).counter).toBe(b.resolve(COUNTER));
  });

  test("the provider resolved inside a scope is that scope's own", () => {
    const provider = counterProvider('scoped');
    const scope = openScope(provider);
    expect(scope.resolve(PROVIDER)).toBe(scope);
  });

  test("the provider resolved from the container's own provider is that provider itself", () => {
    const provider = counterProvider('scoped');
    expect(provider.resolve(PROVIDER)).toBe(provider);
  });

  test("the provider a scoped service is handed is that scope's own", () => {
    const HOLDING = Type.imported('ProviderHolder', 'app');
    class ProviderHolder {
      constructor(readonly provider: IServiceProvider) {}
    }
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(HOLDING, ProviderHolder, Type.ctor(HOLDING, [[PROVIDER]]), 'scoped'))
      .build();
    const scope = openScope(provider);

    expect((scope.resolve(HOLDING) as ProviderHolder).provider).toBe(scope);
  });

  test("the provider a singleton is handed is the container's, wherever the singleton was first reached", () => {
    const HOLDING = Type.imported('ProviderHolder', 'app');
    class ProviderHolder {
      constructor(readonly provider: IServiceProvider) {}
    }
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
          .add(HOLDING, ProviderHolder, Type.ctor(HOLDING, [[PROVIDER]]), 'singleton')
      )
      .build();
    const scope = openScope(provider);
    const scoped = scope.resolve(COUNTER);

    const held = (scope.resolve(HOLDING) as ProviderHolder).provider;
    expect(held).not.toBe(scope);
    // A scoped ask through the singleton's provider is the container's own ask: it is answered
    // from the singleton cache, never from the scope the singleton was first reached through.
    expect(held.resolve(COUNTER)).not.toBe(scoped);
    expect(held.resolve(COUNTER)).toBe(provider.resolve(COUNTER));
  });
});

describe('the marker contract', () => {
  /** An addon composed after the model, so its middleware sits inside the marker and sees every {@link Counter} ask the marker stamped. */
  function observing(seen: Request[]): Addon<StandardLifetime> {
    return {
      registrations: [],
      middleware: next => request => {
        if (request.address === COUNTER) {
          seen.push(request);
        }
        return next(request);
      },
    };
  }

  test("an ask through the container's own provider carries the 'singleton' kind and no scope id", () => {
    const seen: Request[] = [];
    const provider = Builder.useAddon(standardLifetime())
      .useAddon(observing(seen))
      .withServices(m => m.add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'transient'))
      .build();

    provider.resolve(COUNTER);
    expect(seen).toHaveLength(1);
    expect(seen[0]![lifetimeKind]).toBe('singleton');
    expect(seen[0]![scopeId]).toBeUndefined();
  });

  test("an ask through an opened scope carries the 'scoped' kind and that scope's own id, a Symbol unique per scope", () => {
    const seen: Request[] = [];
    const provider = Builder.useAddon(standardLifetime())
      .useAddon(observing(seen))
      .withServices(m => m.add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'transient'))
      .build();
    const scope = openScope(provider);
    const other = openScope(provider);
    seen.length = 0;

    scope.resolve(COUNTER);
    scope.resolve(COUNTER);
    other.resolve(COUNTER);
    expect(seen.map(request => request[lifetimeKind])).toEqual(['scoped', 'scoped', 'scoped']);
    expect(typeof seen[0]![scopeId]).toBe('symbol');
    expect(seen[1]![scopeId]).toBe(seen[0]![scopeId]);
    expect(seen[2]![scopeId]).not.toBe(seen[0]![scopeId]);
  });
});

describe('the built-in registrations', () => {
  test('the scope factory is never constructed, so a singleton may hold it', () => {
    const HOLDING = Type.imported('FactoryHolder', 'app');
    class FactoryHolder {
      constructor(readonly factory: IServiceScopeFactory) {}
    }
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(HOLDING, FactoryHolder, Type.ctor(HOLDING, [[SCOPE_FACTORY]]), 'singleton').add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped'))
      .build();

    const holder = provider.resolve(HOLDING) as FactoryHolder;
    expect(holder.factory).toBe(provider.resolve(SCOPE_FACTORY));
    expect(holder.factory.openScope().resolve(COUNTER)).toBeInstanceOf(Counter);
  });

  test('a value registration is handed back as it stands from every provider', () => {
    const instance = new Counter();
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.addValue(COUNTER, instance))
      .build();

    expect(provider.resolve(COUNTER)).toBe(instance);
    expect(openScope(provider).resolve(COUNTER)).toBe(instance);
  });
});
