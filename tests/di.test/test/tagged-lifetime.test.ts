// Behaviour tests for the tagged lifetime model: what the built provider and each scope cache,
// how an ask is checked along a chain of scopes, what a tag with no open scope and a missing
// lifetime settle for, where the scope factory and the provider an ask is handed come from, and
// how open registrations, several registrations of one address, and asynchronous constructions
// meet the caches. Disposal has a suite of its own.

import { Builder, taggedLifetime } from '@rhombus-std/di';
import { type IDisposableServiceProvider, type IServiceProvider, type ITaggedServiceScopeFactory, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

type Lifetime = 'session' | 'request' | undefined;
type Tag = Exclude<Lifetime, undefined>;

const DI_CORE = '@rhombus-std/di.core';
const SCOPE_FACTORY = Type.imported('ITaggedServiceScopeFactory', DI_CORE, [Type.union(Type.typeLiteral('session'), Type.typeLiteral('request'), Type.typeLiteral(undefined))]);
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
function counterProvider(lifetime?: Lifetime): IDisposableServiceProvider {
  return Builder.useAddon(taggedLifetime<Lifetime>())
    .withServices(m => m.add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), lifetime))
    .build();
}

function factoryOf(provider: IServiceProvider): ITaggedServiceScopeFactory<Lifetime> {
  return provider.resolve(SCOPE_FACTORY) as ITaggedServiceScopeFactory<Lifetime>;
}

function openScope(provider: IServiceProvider, tag: Tag): IDisposableServiceProvider {
  return factoryOf(provider).openScope(tag);
}

describe('the built provider', () => {
  test('caches nothing: a tagged registration is fresh on every ask through it', () => {
    const provider = counterProvider('session');
    expect(provider.resolve(COUNTER)).toBeInstanceOf(Counter);
    expect(provider.resolve(COUNTER)).not.toBe(provider.resolve(COUNTER));
  });

  test('caches nothing under a dependency either: every injection site gets its own', () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'session')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'request')
          .add(PAIR, Pair, Type.ctor(PAIR, [[HOLDER, HOLDER]]))
      )
      .build();

    const pair = provider.resolve(PAIR) as Pair;
    expect(pair.first).not.toBe(pair.second);
    expect(pair.first.counter).not.toBe(pair.second.counter);
  });
});

describe('a scope', () => {
  test('caches its own tag: every ask and every injection site within it shares one instance', () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'request')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]))
      )
      .build();
    const scope = openScope(provider, 'request');

    const holder = scope.resolve(HOLDER) as Holder;
    expect(scope.resolve(COUNTER)).toBe(holder.counter);
    expect((scope.resolve(HOLDER) as Holder).counter).toBe(holder.counter);
  });

  test('constructs lazily, on the first ask, and once however many follow', () => {
    let built = 0;
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m.add(COUNTER, () => {
          built++;
          return new Counter();
        }, Type.func(COUNTER, [[]]), 'session')
      )
      .build();
    const scope = openScope(provider, 'session');

    expect(built).toBe(0);
    scope.resolve(COUNTER);
    scope.resolve(COUNTER);
    expect(built).toBe(1);
  });

  test('passes every other tag through: a registration of another tag is fresh on every ask', () => {
    const scope = openScope(counterProvider('session'), 'request');
    expect(scope.resolve(COUNTER)).toBeInstanceOf(Counter);
    expect(scope.resolve(COUNTER)).not.toBe(scope.resolve(COUNTER));
  });

  test('two scopes of one tag get two instances', () => {
    const provider = counterProvider('request');
    expect(openScope(provider, 'request').resolve(COUNTER)).not.toBe(openScope(provider, 'request').resolve(COUNTER));
  });

  test("an ask through the built provider never reaches a scope's cache", () => {
    const provider = counterProvider('request');
    const scope = openScope(provider, 'request');
    const scoped = scope.resolve(COUNTER);
    expect(provider.resolve(COUNTER)).not.toBe(scoped);
    expect(scope.resolve(COUNTER)).toBe(scoped);
  });
});

describe('the chain', () => {
  test("a hit anywhere on the chain answers: a session-tagged ask through a request scope is the session's instance", () => {
    const session = openScope(counterProvider('session'), 'session');
    const request = openScope(session, 'request');
    expect(request.resolve(COUNTER)).toBe(session.resolve(COUNTER));
    expect(openScope(session, 'request').resolve(COUNTER)).toBe(request.resolve(COUNTER));
  });

  test('a miss constructs under the scope carrying the tag, wherever on the chain it sits', () => {
    const session = openScope(counterProvider('session'), 'session');
    const request = openScope(session, 'request');
    const first = request.resolve(COUNTER);
    expect(session.resolve(COUNTER)).toBe(first);
  });

  test('descendants are checked first: with a scope of another tag between two of one tag, the innermost of that tag answers', () => {
    const provider = counterProvider('request');
    const outer = openScope(provider, 'request');
    const session = openScope(outer, 'session');
    const inner = openScope(session, 'request');

    const fromOuter = outer.resolve(COUNTER);
    expect(session.resolve(COUNTER)).toBe(fromOuter);
    expect(inner.resolve(COUNTER)).not.toBe(fromOuter);
    expect(inner.resolve(COUNTER)).toBe(inner.resolve(COUNTER));
  });

  test('the dependencies of a cached node are cached where their own tags say', () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'session')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'request')
      )
      .build();
    const session = openScope(provider, 'session');
    const request = openScope(session, 'request');

    const holder = request.resolve(HOLDER) as Holder;
    expect(request.resolve(HOLDER)).toBe(holder);
    expect(holder.counter).toBe(session.resolve(COUNTER));
    expect((openScope(session, 'request').resolve(HOLDER) as Holder).counter).toBe(holder.counter);
  });

  test('same-tag nesting: the descendant wins, and the ancestor keeps its own', () => {
    const provider = counterProvider('request');
    const outer = openScope(provider, 'request');
    const inner = openScope(outer, 'request');

    const fromOuter = outer.resolve(COUNTER);
    expect(inner.resolve(COUNTER)).not.toBe(fromOuter);
    expect(inner.resolve(COUNTER)).toBe(inner.resolve(COUNTER));
    expect(outer.resolve(COUNTER)).toBe(fromOuter);
  });

  test('scopes open in any order: a session scope inside a request scope caches the session tag all the same', () => {
    const provider = counterProvider('session');
    const request = openScope(provider, 'request');
    const session = openScope(request, 'session');
    expect(session.resolve(COUNTER)).toBe(session.resolve(COUNTER));
    expect(request.resolve(COUNTER)).not.toBe(session.resolve(COUNTER));
  });
});

describe('a registration naming no lifetime', () => {
  test('omitted, it is transient everywhere: fresh per ask and per injection site, in a scope or out of one', () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]))
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]))
          .add(PAIR, Pair, Type.ctor(PAIR, [[HOLDER, HOLDER]]))
      )
      .build();
    const scope = openScope(provider, 'request');

    const pair = scope.resolve(PAIR) as Pair;
    expect(pair.first.counter).not.toBe(pair.second.counter);
    expect(scope.resolve(COUNTER)).not.toBe(scope.resolve(COUNTER));
    expect(provider.resolve(COUNTER)).not.toBe(scope.resolve(COUNTER));
  });

  test('spelled undefined, it is the same transient', () => {
    const provider = counterProvider(undefined);
    const scope = openScope(openScope(provider, 'session'), 'request');
    expect(scope.resolve(COUNTER)).not.toBe(scope.resolve(COUNTER));
  });

  test('a transient injected into a cached node is constructed with it, once', () => {
    let built = 0;
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(COUNTER, () => {
            built++;
            return new Counter();
          }, Type.func(COUNTER, [[]]))
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[COUNTER]]), 'session')
      )
      .build();
    const session = openScope(provider, 'session');

    const holder = session.resolve(HOLDER) as Holder;
    expect((session.resolve(HOLDER) as Holder).counter).toBe(holder.counter);
    expect(built).toBe(1);
  });
});

describe('a tag with no open scope on the chain', () => {
  test('resolves as a transient through the built provider', () => {
    const provider = counterProvider('request');
    expect(provider.resolve(COUNTER)).toBeInstanceOf(Counter);
    expect(provider.resolve(COUNTER)).not.toBe(provider.resolve(COUNTER));
  });

  test('resolves as a transient through a scope of another tag', () => {
    const session = openScope(counterProvider('request'), 'session');
    expect(session.resolve(COUNTER)).not.toBe(session.resolve(COUNTER));
  });

  test('is cached again the moment a scope carrying the tag is on the chain', () => {
    const session = openScope(counterProvider('request'), 'session');
    const request = openScope(session, 'request');
    expect(request.resolve(COUNTER)).toBe(request.resolve(COUNTER));
    expect(session.resolve(COUNTER)).not.toBe(request.resolve(COUNTER));
  });
});

describe('the scope factory', () => {
  test('is constructed per resolution: two asks answer two factories', () => {
    const provider = counterProvider('session');
    expect(factoryOf(provider)).not.toBe(factoryOf(provider));
  });

  test('resolved from the built provider, it opens scopes over the built provider, beneath no open scope', () => {
    const provider = counterProvider('session');
    const session = openScope(provider, 'session');
    const fromBuilt = factoryOf(provider).openScope('request');

    expect(fromBuilt.resolve(COUNTER)).not.toBe(session.resolve(COUNTER));
    expect(fromBuilt.resolve(COUNTER)).not.toBe(fromBuilt.resolve(COUNTER));
  });

  test('resolved from a scope, it opens scopes chained onto that scope, every time it is resolved there', () => {
    const session = openScope(counterProvider('session'), 'session');
    const first = factoryOf(session);
    const second = factoryOf(session);
    expect(first).not.toBe(second);
    expect(first.openScope('request').resolve(COUNTER)).toBe(session.resolve(COUNTER));
    expect(second.openScope('request').resolve(COUNTER)).toBe(session.resolve(COUNTER));
  });

  test('injected, it is bound to the provider the ask came from', () => {
    const HOLDING = Type.imported('FactoryHolder', 'app');
    class FactoryHolder {
      constructor(readonly factory: ITaggedServiceScopeFactory<Lifetime>) {}
    }
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'session')
          .add(HOLDING, FactoryHolder, Type.ctor(HOLDING, [[SCOPE_FACTORY]]))
      )
      .build();
    const session = openScope(provider, 'session');

    const injected = (session.resolve(HOLDING) as FactoryHolder).factory;
    expect(injected.openScope('request').resolve(COUNTER)).toBe(session.resolve(COUNTER));
    const fromBuilt = (provider.resolve(HOLDING) as FactoryHolder).factory;
    expect(fromBuilt.openScope('request').resolve(COUNTER)).not.toBe(session.resolve(COUNTER));
  });

  test('injected into a cached node, it is bound to the provider that ask came from, whichever scope caches the node', () => {
    const HOLDING = Type.imported('FactoryHolder', 'app');
    class FactoryHolder {
      constructor(readonly factory: ITaggedServiceScopeFactory<Lifetime>) {}
    }
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'request')
          .add(HOLDING, FactoryHolder, Type.ctor(HOLDING, [[SCOPE_FACTORY]]), 'session')
      )
      .build();
    const session = openScope(provider, 'session');
    const request = openScope(session, 'request');

    const held = (request.resolve(HOLDING) as FactoryHolder).factory;
    expect(session.resolve(HOLDING)).toBe(request.resolve(HOLDING));
    expect(held.openScope('session').resolve(COUNTER)).toBe(request.resolve(COUNTER));
  });

  test("a user's own registration of the factory address wins", () => {
    const opened: unknown[] = [];
    const own: ITaggedServiceScopeFactory<Lifetime> = {
      openScope(lifetime) {
        opened.push(lifetime);
        return counterProvider('session');
      },
    };
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m => m.addValue(SCOPE_FACTORY, own))
      .build();

    expect(factoryOf(provider)).toBe(own);
    factoryOf(provider).openScope('session');
    expect(opened).toEqual(['session']);
  });
});

describe('the provider an ask is handed', () => {
  test('resolved from a scope, it resolves against that scope', () => {
    const provider = counterProvider('request');
    const request = openScope(provider, 'request');
    const handed = request.resolve(PROVIDER) as IServiceProvider;
    expect(handed.resolve(COUNTER)).toBe(request.resolve(COUNTER));
    expect(handed.resolve(COUNTER)).not.toBe(provider.resolve(COUNTER));
  });

  test('injected into a cached node, it is the provider that ask came from, whichever scope caches the node', () => {
    const HOLDING = Type.imported('ProviderHolder', 'app');
    class ProviderHolder {
      constructor(readonly provider: IServiceProvider) {}
    }
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'request')
          .add(HOLDING, ProviderHolder, Type.ctor(HOLDING, [[PROVIDER]]), 'session')
      )
      .build();
    const session = openScope(provider, 'session');
    const request = openScope(session, 'request');

    const held = (request.resolve(HOLDING) as ProviderHolder).provider;
    expect(held.resolve(COUNTER)).toBe(request.resolve(COUNTER));
    expect(held.resolve(COUNTER)).not.toBe(session.resolve(COUNTER));
  });
});

describe('open registrations', () => {
  test('an open registration is cached once per closing', () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m => m.add(box(T), Box, Type.ctor(box(T), [[T]]), 'session').add(COUNTER, Counter, Type.ctor(COUNTER, [[]])))
      .build();
    const session = openScope(provider, 'session');

    const ofCounter = session.resolve(box(COUNTER)) as Box;
    expect(session.resolve(box(COUNTER))).toBe(ofCounter);
    expect(session.resolve(box(box(COUNTER)))).not.toBe(ofCounter);
    expect(session.resolve(box(box(COUNTER)))).toBe(session.resolve(box(box(COUNTER))));
  });
});

describe('several registrations of one address', () => {
  test('a single ask answers the last registration, under its own tag alone', () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'session')
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'request')
      )
      .build();
    const session = openScope(provider, 'session');

    expect(session.resolve(COUNTER)).not.toBe(session.resolve(COUNTER));
    const request = openScope(session, 'request');
    expect(request.resolve(COUNTER)).toBe(request.resolve(COUNTER));
  });

  test('a collection ask keeps every registration distinct, each under its own tag', () => {
    const session = Registration.ctor<Lifetime>(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'session');
    const request = Registration.ctor<Lifetime>(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'request');
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m => m.add(session).add(request))
      .build();
    const sessionScope = openScope(provider, 'session');
    const requestScope = openScope(sessionScope, 'request');

    const first = Array.from(requestScope.resolveMany(COUNTER)) as Counter[];
    const second = Array.from(requestScope.resolveMany(COUNTER)) as Counter[];
    expect(first).toHaveLength(2);
    expect(first[0]).not.toBe(first[1]);
    expect(first[0]).toBe(second[0]);
    expect(first[1]).toBe(second[1]);
    expect(first[1]).toBe(requestScope.resolve(COUNTER));
    expect(Array.from(sessionScope.resolveMany(COUNTER))[0]).toBe(first[0]);
    // A single ask answers the last registration, whose tag the session scope does not carry.
    expect(sessionScope.resolve(COUNTER)).not.toBe(first[1]);
  });

  test('two registrations of one address under one tag are two entries of that scope', () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'session')
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'session')
      )
      .build();
    const session = openScope(provider, 'session');

    const all = Array.from(session.resolveMany(COUNTER)) as Counter[];
    expect(all[0]).not.toBe(all[1]);
    expect(all[1]).toBe(session.resolve(COUNTER));
    expect(Array.from(session.resolveMany(COUNTER))).toEqual(all);
  });
});

describe('creation failure', () => {
  test('a construction that throws caches nothing, so the next ask constructs again', () => {
    let attempts = 0;
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m.add(COUNTER, () => {
          attempts++;
          if (attempts === 1) {
            throw new Error('not yet');
          }
          return new Counter();
        }, Type.func(COUNTER, [[]]), 'session')
      )
      .build();
    const session = openScope(provider, 'session');

    expect(() => session.resolve(COUNTER)).toThrow('not yet');
    expect(session.resolve(COUNTER)).toBeInstanceOf(Counter);
    expect(attempts).toBe(2);
  });
});

describe('asynchronous constructions', () => {
  test('concurrent asks for a pending construction share it', async () => {
    let built = 0;
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m.add(COUNTER, async () => {
          built++;
          await new Promise(resolve => setTimeout(resolve, 0));
          return new Counter();
        }, Type.func(Type.promise(COUNTER), [[]]), 'session')
      )
      .build();
    const session = openScope(provider, 'session');

    const [first, second] = await Promise.all([session.resolveAsync(COUNTER), session.resolveAsync(COUNTER)]);
    expect(first).toBe(second);
    expect(built).toBe(1);
  });

  test('a construction that rejects is forgotten, so the next ask constructs again', async () => {
    let attempts = 0;
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m.add(COUNTER, async () => {
          attempts++;
          if (attempts === 1) {
            throw new Error('not yet');
          }
          return new Counter();
        }, Type.func(Type.promise(COUNTER), [[]]), 'session')
      )
      .build();
    const session = openScope(provider, 'session');

    await expect(session.resolveAsync(COUNTER)).rejects.toThrow('not yet');
    expect(await session.resolveAsync(COUNTER)).toBeInstanceOf(Counter);
    expect(attempts).toBe(2);
  });

  test('concurrent asks share a pending construction even when it goes on to reject, and the next ask constructs again', async () => {
    let attempts = 0;
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m.add(COUNTER, async () => {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 0));
          if (attempts === 1) {
            throw new Error('not yet');
          }
          return new Counter();
        }, Type.func(Type.promise(COUNTER), [[]]), 'session')
      )
      .build();
    const session = openScope(provider, 'session');

    const outcomes = await Promise.allSettled([session.resolveAsync(COUNTER), session.resolveAsync(COUNTER)]);
    expect(outcomes.map(outcome => outcome.status)).toEqual(['rejected', 'rejected']);
    expect(attempts).toBe(1);
    expect(await session.resolveAsync(COUNTER)).toBeInstanceOf(Counter);
    expect(attempts).toBe(2);
  });
});

describe('a value registration', () => {
  test('is handed back as it stands from every provider', () => {
    const instance = new Counter();
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m => m.addValue(COUNTER, instance))
      .build();

    expect(provider.resolve(COUNTER)).toBe(instance);
    expect(openScope(openScope(provider, 'session'), 'request').resolve(COUNTER)).toBe(instance);
  });
});
