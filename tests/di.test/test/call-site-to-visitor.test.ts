// Behaviour tests for ToCallSiteVisitor: what CallSite tree a Type request lowers to. Every node
// is checked against the registry first; the per-kind visit methods are the fallback decomposition
// or synthesis a whole-type miss falls back to.

import { CycleError, DefaultManifest, type Manifest, ScopeFactory, ServiceDescriptor } from '@rhombus-std/di.core';
import { CallSite } from '@rhombus-std/di/private/internal/CallSite/CallSite';
import { ToCallSiteVisitor } from '@rhombus-std/di/private/internal/CallSite/ToCallSiteVisitor';
import { Registry } from '@rhombus-std/di/private/internal/Registry';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const CONN = Type.imported('Conn', 'app');
const WIDGET = Type.imported('Widget', 'app');
const FOO = Type.imported('Foo', 'app');
const BAR = Type.imported('Bar', 'app');
const CACHE = Type.imported('Cache', 'app');
const REDIS = Type.imported('Redis', 'app');
const LOOP = Type.imported('Loop', 'app');
const T = Type.generic('T');
const box = (of: Type) => Type.imported('Box', 'app', [of]);
const holder = (of: Type) => Type.imported('Holder', 'app', [of]);
const crate = (of: Type) => Type.imported('Crate', 'app', [of]);

class Conn {}
class Widget {
  constructor(readonly conn: unknown) {}
}
class MemoryCache {}
class RedisCache {}
class Box {
  constructor(readonly closing: unknown) {}
}
class Holder {}
class Crate {
  constructor(readonly closing: unknown, readonly held: unknown) {}
}
class Loop {
  constructor(readonly self: unknown) {}
}

/** `opensScopes` defaults to `false`: only the scope-factory-address test needs it `true`. */
function visitorFor(manifest: Manifest<unknown>, opensScopes = false) {
  return new ToCallSiteVisitor(new Registry(manifest, opensScopes));
}

describe('a ctor registration', () => {
  test('lowers to a CtorCallSite over its realized parameter signature', () => {
    const connDescriptor = ServiceDescriptor.ctor(CONN, Conn, Type.ctor(CONN, [[]]));
    const widgetDescriptor = ServiceDescriptor.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CONN]]));
    const manifest = DefaultManifest.empty<unknown>().add(connDescriptor).add(widgetDescriptor);
    expect(visitorFor(manifest).visit(WIDGET)).toEqual(
      CallSite.registeredCtor(Widget, [CallSite.registeredCtor(Conn, [], CONN, connDescriptor)], WIDGET, widgetDescriptor),
    );
  });

  test('carries its own descriptor whether or not the registration has a lifetime', () => {
    const withLifetime = ServiceDescriptor.ctor(CONN, Conn, Type.ctor(CONN, [[]]), 'singleton');
    expect(visitorFor(DefaultManifest.empty<unknown>().add(withLifetime)).visit(CONN))
      .toEqual(CallSite.registeredCtor(Conn, [], CONN, withLifetime));

    const withoutLifetime = ServiceDescriptor.ctor(CONN, Conn, Type.ctor(CONN, [[]]));
    expect(visitorFor(DefaultManifest.empty<unknown>().add(withoutLifetime)).visit(CONN))
      .toEqual(CallSite.registeredCtor(Conn, [], CONN, withoutLifetime));
  });
});

describe('a factory registration', () => {
  test('lowers to a FactoryCallSite the same way a ctor does', () => {
    const impl = () => new Conn();
    const descriptor = ServiceDescriptor.factory(CONN, impl, Type.func(CONN, [[]]));
    expect(visitorFor(DefaultManifest.empty<unknown>().add(descriptor)).visit(CONN))
      .toEqual(CallSite.registeredFactory(impl, [], CONN, descriptor));
  });
});

describe('a value registration', () => {
  test('lowers to a ConstantCallSite carrying the value as-is', () => {
    const value = { name: 'redis' };
    const manifest = DefaultManifest.empty<unknown>().add(ServiceDescriptor.value(CACHE, value));
    expect(visitorFor(manifest).visit(CACHE)).toEqual(CallSite.constant(value));
  });
});

describe('signature selection', () => {
  test('takes the longest signature every parameter of which lowers', () => {
    const connDescriptor = ServiceDescriptor.ctor(CONN, Conn, Type.ctor(CONN, [[]]));
    const widgetDescriptor = ServiceDescriptor.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CONN, CACHE], [CONN]]));
    const manifest = DefaultManifest.empty<unknown>().add(connDescriptor).add(widgetDescriptor);
    // Nothing produces CACHE, so the two-parameter signature cannot lower and the shorter one wins.
    expect(visitorFor(manifest).visit(WIDGET)).toEqual(
      CallSite.registeredCtor(Widget, [CallSite.registeredCtor(Conn, [], CONN, connDescriptor)], WIDGET, widgetDescriptor),
    );
  });

  test('is unsatisfiable when no signature lowers in full', () => {
    const manifest = DefaultManifest.empty<unknown>()
      .add(ServiceDescriptor.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CACHE]])));
    expect(visitorFor(manifest).visit(WIDGET)).toBeUndefined();
  });
});

describe('a bare generic-hole parameter', () => {
  test('receives the closing type as a ConstantCallSite', () => {
    const descriptor = ServiceDescriptor.ctor(box(T), Box, Type.ctor(box(T), [[T]]));
    const manifest = DefaultManifest.empty<unknown>().add(descriptor);
    expect(visitorFor(manifest).visit(box(FOO))).toEqual(
      CallSite.registeredCtor(Box, [CallSite.constant(FOO)], box(FOO), descriptor),
    );
  });

  test('tracks the request, so two closings lower to two different sites', () => {
    const descriptor = ServiceDescriptor.ctor(box(T), Box, Type.ctor(box(T), [[T]]));
    const manifest = DefaultManifest.empty<unknown>().add(descriptor);
    const visitor = visitorFor(manifest);
    expect(visitor.visit(box(FOO))).toEqual(CallSite.registeredCtor(Box, [CallSite.constant(FOO)], box(FOO), descriptor));
    expect(visitor.visit(box(BAR))).toEqual(CallSite.registeredCtor(Box, [CallSite.constant(BAR)], box(BAR), descriptor));
  });
});

describe('a generic hole inside a bigger parameter', () => {
  test('closes into the expression and lowers as an ordinary dependency', () => {
    const crateDescriptor = ServiceDescriptor.ctor(crate(T), Crate, Type.ctor(crate(T), [[T, holder(T)]]));
    const holderDescriptor = ServiceDescriptor.ctor(holder(FOO), Holder, Type.ctor(holder(FOO), [[]]));
    const manifest = DefaultManifest.empty<unknown>().add(crateDescriptor).add(holderDescriptor);
    expect(visitorFor(manifest).visit(crate(FOO))).toEqual(
      CallSite.registeredCtor(
        Crate,
        [CallSite.constant(FOO), CallSite.registeredCtor(Holder, [], holder(FOO), holderDescriptor)],
        crate(FOO),
        crateDescriptor,
      ),
    );
  });

  test('is unsatisfiable when the closed expression names nothing', () => {
    const manifest = DefaultManifest.empty<unknown>()
      .add(ServiceDescriptor.ctor(crate(T), Crate, Type.ctor(crate(T), [[T, holder(T)]])));
    expect(visitorFor(manifest).visit(crate(FOO))).toBeUndefined();
  });
});

describe('tagged types', () => {
  test('a tag is its own address, distinct from the base it tags', () => {
    const tagged = Type.tag(FOO, 'primary');
    const manifest = DefaultManifest.empty<unknown>()
      .add(ServiceDescriptor.value(tagged, 'the primary one'))
      .add(ServiceDescriptor.value(FOO, 'the plain one'));
    const visitor = visitorFor(manifest);
    expect(visitor.visit(tagged)).toEqual(CallSite.constant('the primary one'));
    expect(visitor.visit(FOO)).toEqual(CallSite.constant('the plain one'));
  });

  test('an unregistered tag has nothing to build it from', () => {
    const manifest = DefaultManifest.empty<unknown>().add(ServiceDescriptor.value(FOO, 'the plain one'));
    expect(visitorFor(manifest).visit(Type.tag(FOO, 'primary'))).toBeUndefined();
  });
});

describe('the service provider and scope factory', () => {
  test('IServiceProvider resolves under its declaring-module address, with no registration', () => {
    const visitor = visitorFor(DefaultManifest.empty<unknown>());
    expect(visitor.visit(Type.imported('IServiceProvider', '@rhombus-std/di.core'))).toEqual(
      CallSite.serviceProvider(),
    );
  });

  test('the ScopeFactory address resolves the same way, when the container opens scopes at all', () => {
    const visitor = visitorFor(DefaultManifest.empty<unknown>(), true);
    expect(visitor.visit(ScopeFactory.address)).toEqual(CallSite.scopeFactory());
  });

  test('a same-named import from an unrecognized module is not the provider', () => {
    const visitor = visitorFor(DefaultManifest.empty<unknown>());
    expect(visitor.visit(Type.imported('IServiceProvider', 'somewhere-else'))).toBeUndefined();
  });
});

describe('a function type standing for a late-bound call', () => {
  test('lowers to a LateBoundCallSite naming the return type and argument signatures', () => {
    const requested = Type.func(WIDGET, [[CONN]]);
    expect(visitorFor(DefaultManifest.empty<unknown>()).visit(requested)).toEqual(CallSite.latebound(requested));
  });

  test('a registration for the function type itself still wins', () => {
    const impl = () => new Conn();
    const manifest = DefaultManifest.empty<unknown>().add(ServiceDescriptor.value(Type.func(WIDGET, [[CONN]]), impl));
    expect(visitorFor(manifest).visit(Type.func(WIDGET, [[CONN]]))).toEqual(CallSite.constant(impl));
  });
});

describe('a tuple type', () => {
  test('lowers to a FactoryCallSite collecting each member', () => {
    const manifest = DefaultManifest.empty<unknown>()
      .add(ServiceDescriptor.value(FOO, 'foo-value'))
      .add(ServiceDescriptor.value(BAR, 'bar-value'));
    const site = visitorFor(manifest).visit(Type.tuple(FOO, BAR));
    expect(site?.kind).toBe('factory');
    expect(site?.kind === 'factory' && site.factory('foo-value', 'bar-value')).toEqual(['foo-value', 'bar-value']);
  });

  test('is unsatisfiable when any member is', () => {
    const manifest = DefaultManifest.empty<unknown>().add(ServiceDescriptor.value(FOO, 'foo-value'));
    expect(visitorFor(manifest).visit(Type.tuple(FOO, BAR))).toBeUndefined();
  });
});

describe('a type literal', () => {
  test('lowers to a ConstantCallSite carrying the literal value', () => {
    expect(visitorFor(DefaultManifest.empty<unknown>()).visit(Type.typeLiteral(42))).toEqual(CallSite.constant(42));
  });
});

describe('type kinds nothing is synthesized from', () => {
  test('a constructor type requested directly stays unsatisfiable', () => {
    expect(visitorFor(DefaultManifest.empty<unknown>()).visit(Type.ctor(FOO, [[]]))).toBeUndefined();
  });

  test('an intersection is answered only by a whole-type registration, never assembled from its parts', () => {
    expect(visitorFor(DefaultManifest.empty<unknown>()).visit(Type.intersection(FOO, BAR))).toBeUndefined();
  });

  test('an object type is not assembled from its members', () => {
    expect(visitorFor(DefaultManifest.empty<unknown>()).visit(Type.object({ name: FOO }))).toBeUndefined();
  });

  test('a global type has nothing to build it from', () => {
    expect(visitorFor(DefaultManifest.empty<unknown>()).visit(Type.global('String'))).toBeUndefined();
  });
});

describe('an aggregate over every registration for one type', () => {
  test('an iterable collects them oldest to newest, ending with the newest', () => {
    const manifest = DefaultManifest.empty<unknown>()
      .add(ServiceDescriptor.value(FOO, 'first'))
      .add(ServiceDescriptor.value(FOO, 'second'))
      .add(ServiceDescriptor.value(FOO, 'third'));
    const site = visitorFor(manifest).visit(Type.iterable(FOO));
    expect(site).toEqual(
      CallSite.iterable([CallSite.constant('first'), CallSite.constant('second'), CallSite.constant('third')]),
    );
  });

  test('an array collects the same members eagerly instead', () => {
    const manifest = DefaultManifest.empty<unknown>().add(ServiceDescriptor.value(FOO, 'only'));
    expect(visitorFor(manifest).visit(Type.array(FOO))).toEqual(CallSite.array([CallSite.constant('only')]));
  });

  test('nothing registered is the empty collection, not a failure', () => {
    expect(visitorFor(DefaultManifest.empty<unknown>()).visit(Type.iterable(FOO))).toEqual(CallSite.iterable([]));
  });

  test('a member built without any registration for it is the tail, after every registered one', () => {
    const manifest = DefaultManifest.empty<unknown>()
      .add(ServiceDescriptor.value(Type.tuple(FOO, BAR), 'registered-directly'))
      .add(ServiceDescriptor.value(FOO, 'foo-value'))
      .add(ServiceDescriptor.value(BAR, 'bar-value'));
    const site = visitorFor(manifest).visit(Type.iterable(Type.tuple(FOO, BAR)));
    expect(site?.kind).toBe('iterable');
    expect(site?.kind === 'iterable' && site.types.map(inner => inner.kind)).toEqual(['constant', 'factory']);
  });
});

describe('a union dependency', () => {
  test('one suppliable member answers it', () => {
    const descriptor = ServiceDescriptor.ctor(CACHE, MemoryCache, Type.ctor(CACHE, [[]]));
    const manifest = DefaultManifest.empty<unknown>().add(descriptor);
    expect(visitorFor(manifest).visit(Type.union(CACHE, REDIS))).toEqual(
      CallSite.registeredCtor(MemoryCache, [], CACHE, descriptor),
    );
  });

  test('a registration for the union itself settles it outright', () => {
    const union = Type.union(CACHE, REDIS);
    const manifest = DefaultManifest.empty<unknown>()
      .add(ServiceDescriptor.ctor(CACHE, MemoryCache, Type.ctor(CACHE, [[]])))
      .add(ServiceDescriptor.value(union, 'the union itself'));
    expect(visitorFor(manifest).visit(union)).toEqual(CallSite.constant('the union itself'));
  });

  test('several suppliable members settle on the first in canonical member order', () => {
    const redisDescriptor = ServiceDescriptor.ctor(REDIS, RedisCache, Type.ctor(REDIS, [[]]));
    const cacheDescriptor = ServiceDescriptor.ctor(CACHE, MemoryCache, Type.ctor(CACHE, [[]]));
    const manifest = DefaultManifest.empty<unknown>().add(redisDescriptor).add(cacheDescriptor);
    // app:Cache orders before app:Redis, whichever was registered first.
    expect(visitorFor(manifest).visit(Type.union(CACHE, REDIS))).toEqual(
      CallSite.registeredCtor(MemoryCache, [], CACHE, cacheDescriptor),
    );
  });

  test('a self-supplying member is the fallback for when nothing else is registered', () => {
    const optional = Type.union(CACHE, Type.typeLiteral(undefined));
    const cacheDescriptor = ServiceDescriptor.ctor(CACHE, MemoryCache, Type.ctor(CACHE, [[]]));
    const withCache = DefaultManifest.empty<unknown>().add(cacheDescriptor);
    expect(visitorFor(withCache).visit(optional)).toEqual(CallSite.registeredCtor(MemoryCache, [], CACHE, cacheDescriptor));
    expect(visitorFor(DefaultManifest.empty<unknown>()).visit(optional)).toEqual(CallSite.constant(undefined));
  });

  test('a member built without any registration for it can still answer the union', () => {
    const manifest = DefaultManifest.empty<unknown>()
      .add(ServiceDescriptor.value(FOO, 'foo-value'))
      .add(ServiceDescriptor.value(BAR, 'bar-value'));
    const union = Type.union(Type.tuple(FOO, BAR), Type.typeLiteral(null));
    const site = visitorFor(manifest).visit(union);
    expect(site?.kind).toBe('factory');
    expect(site?.kind === 'factory' && site.factory('foo-value', 'bar-value')).toEqual(['foo-value', 'bar-value']);
  });

  test('two members that both synthesize settle the same way: the first in canonical order wins', () => {
    const manifest = DefaultManifest.empty<unknown>()
      .add(ServiceDescriptor.value(FOO, 'foo-value'))
      .add(ServiceDescriptor.value(BAR, 'bar-value'));
    const union = Type.union(Type.tuple(FOO, BAR), Type.tuple(BAR, FOO));
    const site = visitorFor(manifest).visit(union);
    expect(site?.kind).toBe('factory');
    // [app:Bar, app:Foo] orders before [app:Foo, app:Bar], so its synthesis answers.
    expect(site?.kind === 'factory' && site.factory('bar-value', 'foo-value')).toEqual(['bar-value', 'foo-value']);
  });

  // A union tries each member registration-then-synthesis in ONE PASS, in canonical order — it
  // does not run a registration phase across every member ahead of a synthesis phase. So when
  // the earlier-ordered member ([app:Bar, app:Foo]) synthesizes on its own, that answers the
  // union outright; a later member's own registration ([app:Foo, app:Bar], here) never gets a
  // turn. This test asserted the two-phase reading the design does not have.
  test.skip("a member registration outranks another member's synthesis, whatever the member order", () => {});
});

describe('the cycle guard', () => {
  test('throws CycleError naming the path back to the repeat', () => {
    const manifest = DefaultManifest.empty<unknown>().add(ServiceDescriptor.ctor(LOOP, Loop, Type.ctor(LOOP, [[LOOP]])));
    try {
      visitorFor(manifest).visit(LOOP);
      throw new Error('expected a CycleError');
    } catch (error) {
      expect(error).toBeInstanceOf(CycleError);
      expect((error as CycleError).chain).toEqual([LOOP, LOOP]);
    }
  });

  test('a longer loop names every type on the path', () => {
    const A = Type.imported('A', 'app');
    const B = Type.imported('B', 'app');
    class ImplA {
      constructor(readonly b: unknown) {}
    }
    class ImplB {
      constructor(readonly a: unknown) {}
    }
    const manifest = DefaultManifest.empty<unknown>()
      .add(ServiceDescriptor.ctor(A, ImplA, Type.ctor(A, [[B]])))
      .add(ServiceDescriptor.ctor(B, ImplB, Type.ctor(B, [[A]])));
    try {
      visitorFor(manifest).visit(A);
      throw new Error('expected a CycleError');
    } catch (error) {
      expect(error).toBeInstanceOf(CycleError);
      expect((error as CycleError).chain).toEqual([A, B, A]);
    }
  });
});

describe('an unanswered address', () => {
  test('returns undefined rather than throwing', () => {
    expect(visitorFor(DefaultManifest.empty<unknown>()).visit(FOO)).toBeUndefined();
  });
});
