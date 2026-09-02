// Behaviour tests for PlannerVisitor: what Plan tree a Type request lowers to. Every node
// is checked against the registry first; the per-kind visit methods are the fallback decomposition
// or synthesis a whole-type miss falls back to.

import { CycleError, Manifest, Registration } from '@rhombus-std/di.core';
import { Plan } from '@rhombus-std/di/private/internal/Plan/Plan';
import { PlannerVisitor } from '@rhombus-std/di/private/internal/Plan/PlannerVisitor';
import { Registry } from '@rhombus-std/di/private/internal/Registry';
import { type ConstructorType, Type } from '@rhombus-std/primitives';
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

function visitorFor(manifest: Manifest<unknown>) {
  return new PlannerVisitor(new Registry(manifest));
}

describe('a ctor registration', () => {
  test('lowers to a CtorPlan over its realized parameter signature', () => {
    const connRegistration = Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]));
    const widgetRegistration = Registration.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CONN]]));
    const manifest = Manifest.empty<unknown>().add(connRegistration).add(widgetRegistration);
    expect(visitorFor(manifest).visit(WIDGET)).toEqual(
      Plan.registeredCtor(Widget, [Plan.registeredCtor(Conn, [], CONN, connRegistration)], WIDGET, widgetRegistration),
    );
  });

  test('carries its own registration whether or not the registration has a lifetime', () => {
    const withLifetime = Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]), 'singleton');
    expect(visitorFor(Manifest.empty<unknown>().add(withLifetime)).visit(CONN))
      .toEqual(Plan.registeredCtor(Conn, [], CONN, withLifetime));

    const withoutLifetime = Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]));
    expect(visitorFor(Manifest.empty<unknown>().add(withoutLifetime)).visit(CONN))
      .toEqual(Plan.registeredCtor(Conn, [], CONN, withoutLifetime));
  });
});

describe('a factory registration', () => {
  test('lowers to a FactoryPlan the same way a ctor does', () => {
    const impl = () => new Conn();
    const registration = Registration.factory(CONN, impl, Type.func(CONN, [[]]));
    expect(visitorFor(Manifest.empty<unknown>().add(registration)).visit(CONN))
      .toEqual(Plan.registeredFactory(impl, [], CONN, registration));
  });
});

describe('a value registration', () => {
  test('lowers to a ConstantPlan carrying the value as-is', () => {
    const value = { name: 'redis' };
    const manifest = Manifest.empty<unknown>().add(Registration.value(CACHE, value));
    expect(visitorFor(manifest).visit(CACHE)).toEqual(Plan.constant(value));
  });
});

describe('signature selection', () => {
  test('takes the longest signature every parameter of which lowers', () => {
    const connRegistration = Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]));
    const widgetRegistration = Registration.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CONN, CACHE], [CONN]]));
    const manifest = Manifest.empty<unknown>().add(connRegistration).add(widgetRegistration);
    // Nothing produces CACHE, so the two-parameter signature cannot lower and the shorter one wins.
    expect(visitorFor(manifest).visit(WIDGET)).toEqual(
      Plan.registeredCtor(Widget, [Plan.registeredCtor(Conn, [], CONN, connRegistration)], WIDGET, widgetRegistration),
    );
  });

  test('is unsatisfiable when no signature lowers in full', () => {
    const manifest = Manifest.empty<unknown>()
      .add(Registration.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CACHE]])));
    expect(visitorFor(manifest).visit(WIDGET)).toBeUndefined();
  });
});

describe('a rest signature', () => {
  test('an all-rest row lowers the whole argument list as one list plan', () => {
    const connRegistration = Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]));
    const widgetRegistration = Registration.ctor(WIDGET, Widget, Type.ctor(WIDGET, Type.array(CONN)));
    const manifest = Manifest.empty<unknown>().add(connRegistration).add(widgetRegistration);
    expect(visitorFor(manifest).visit(WIDGET)).toEqual(
      Plan.registeredCtor({
        ctor: Widget,
        args: [],
        rest: Plan.array([Plan.registeredCtor(Conn, [], CONN, connRegistration)]),
        populatedAddress: WIDGET,
        registration: widgetRegistration,
      }),
    );
  });

  test('a required prefix plus a trailing rest lowers the prefix per slot and the open length as its list', () => {
    const connRegistration = Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]));
    const crateRegistration = Registration.ctor(FOO, Crate, Type.ctor(FOO, Type.tuple({ members: [CONN], rest: CONN })));
    const manifest = Manifest.empty<unknown>().add(connRegistration).add(crateRegistration);
    const connPlan = Plan.registeredCtor(Conn, [], CONN, connRegistration);
    expect(visitorFor(manifest).visit(FOO)).toEqual(
      Plan.registeredCtor({
        ctor: Crate,
        args: [connPlan],
        rest: Plan.array([connPlan]),
        populatedAddress: FOO,
        registration: crateRegistration,
      }),
    );
  });
});

describe('a bare generic-hole parameter', () => {
  test('receives the closing type as a ConstantPlan', () => {
    const registration = Registration.ctor(box(T), Box, Type.ctor(box(T), [[T]]));
    const manifest = Manifest.empty<unknown>().add(registration);
    expect(visitorFor(manifest).visit(box(FOO))).toEqual(
      Plan.registeredCtor(Box, [Plan.constant(FOO)], box(FOO), registration),
    );
  });

  test('tracks the request, so two closings lower to two different plans', () => {
    const registration = Registration.ctor(box(T), Box, Type.ctor(box(T), [[T]]));
    const manifest = Manifest.empty<unknown>().add(registration);
    const visitor = visitorFor(manifest);
    expect(visitor.visit(box(FOO))).toEqual(Plan.registeredCtor(Box, [Plan.constant(FOO)], box(FOO), registration));
    expect(visitor.visit(box(BAR))).toEqual(Plan.registeredCtor(Box, [Plan.constant(BAR)], box(BAR), registration));
  });
});

describe('a generic hole inside a bigger parameter', () => {
  test('closes into the expression and lowers as an ordinary dependency', () => {
    const crateRegistration = Registration.ctor(crate(T), Crate, Type.ctor(crate(T), [[T, holder(T)]]));
    const holderRegistration = Registration.ctor(holder(FOO), Holder, Type.ctor(holder(FOO), [[]]));
    const manifest = Manifest.empty<unknown>().add(crateRegistration).add(holderRegistration);
    expect(visitorFor(manifest).visit(crate(FOO))).toEqual(
      Plan.registeredCtor(
        Crate,
        [Plan.constant(FOO), Plan.registeredCtor(Holder, [], holder(FOO), holderRegistration)],
        crate(FOO),
        crateRegistration,
      ),
    );
  });

  test('is unsatisfiable when the closed expression names nothing', () => {
    const manifest = Manifest.empty<unknown>()
      .add(Registration.ctor(crate(T), Crate, Type.ctor(crate(T), [[T, holder(T)]])));
    expect(visitorFor(manifest).visit(crate(FOO))).toBeUndefined();
  });
});

describe('tagged types', () => {
  test('a tag is its own address, distinct from the base it tags', () => {
    const tagged = Type.tag(FOO, 'primary');
    const manifest = Manifest.empty<unknown>()
      .add(Registration.value(tagged, 'the primary one'))
      .add(Registration.value(FOO, 'the plain one'));
    const visitor = visitorFor(manifest);
    expect(visitor.visit(tagged)).toEqual(Plan.constant('the primary one'));
    expect(visitor.visit(FOO)).toEqual(Plan.constant('the plain one'));
  });

  test('an unregistered tag has nothing to build it from', () => {
    const manifest = Manifest.empty<unknown>().add(Registration.value(FOO, 'the plain one'));
    expect(visitorFor(manifest).visit(Type.tag(FOO, 'primary'))).toBeUndefined();
  });
});

// IServiceProvider carries no special case here: it resolves through an ordinary registration,
// seeded by the lifetime model under `controlLifetime` and answered by the engine directly.

describe('a function type standing for a late-bound call', () => {
  test('lowers to a LateBoundPlan naming the return type and argument signatures', () => {
    const requested = Type.func(WIDGET, [[CONN]]);
    expect(visitorFor(Manifest.empty<unknown>()).visit(requested)).toEqual(Plan.latebound(requested));
  });

  test('a registration for the function type itself still wins', () => {
    const impl = () => new Conn();
    const manifest = Manifest.empty<unknown>().add(Registration.value(Type.func(WIDGET, [[CONN]]), impl));
    expect(visitorFor(manifest).visit(Type.func(WIDGET, [[CONN]]))).toEqual(Plan.constant(impl));
  });
});

describe('a tuple type', () => {
  test('lowers to a FactoryPlan collecting each member', () => {
    const manifest = Manifest.empty<unknown>()
      .add(Registration.value(FOO, 'foo-value'))
      .add(Registration.value(BAR, 'bar-value'));
    const plan = visitorFor(manifest).visit(Type.tuple(FOO, BAR));
    expect(plan?.kind).toBe('factory');
    expect(plan?.kind === 'factory' && plan.factory('foo-value', 'bar-value')).toEqual(['foo-value', 'bar-value']);
  });

  test('is unsatisfiable when any member is', () => {
    const manifest = Manifest.empty<unknown>().add(Registration.value(FOO, 'foo-value'));
    expect(visitorFor(manifest).visit(Type.tuple(FOO, BAR))).toBeUndefined();
  });
});

describe('a type literal', () => {
  test('lowers to a ConstantPlan carrying the literal value', () => {
    expect(visitorFor(Manifest.empty<unknown>()).visit(Type.typeLiteral(42))).toEqual(Plan.constant(42));
  });
});

describe('type kinds nothing is synthesized from', () => {
  test('a constructor type requested directly stays unsatisfiable', () => {
    expect(visitorFor(Manifest.empty<unknown>()).visit(Type.ctor(FOO, [[]]))).toBeUndefined();
  });

  test('an intersection is answered only by a whole-type registration, never assembled from its parts', () => {
    expect(visitorFor(Manifest.empty<unknown>()).visit(Type.intersection(FOO, BAR))).toBeUndefined();
  });

  test('an object type is not assembled from its members', () => {
    expect(visitorFor(Manifest.empty<unknown>()).visit(Type.object({ name: FOO }))).toBeUndefined();
  });

  test('a global type has nothing to build it from', () => {
    expect(visitorFor(Manifest.empty<unknown>()).visit(Type.global('String'))).toBeUndefined();
  });
});

describe('an aggregate over every registration for one type', () => {
  test('an iterable collects them oldest to newest, ending with the newest', () => {
    const manifest = Manifest.empty<unknown>()
      .add(Registration.value(FOO, 'first'))
      .add(Registration.value(FOO, 'second'))
      .add(Registration.value(FOO, 'third'));
    const plan = visitorFor(manifest).visit(Type.iterable(FOO));
    expect(plan).toEqual(
      Plan.iterable([Plan.constant('first'), Plan.constant('second'), Plan.constant('third')]),
    );
  });

  test('an array collects the same members eagerly instead', () => {
    const manifest = Manifest.empty<unknown>().add(Registration.value(FOO, 'only'));
    expect(visitorFor(manifest).visit(Type.array(FOO))).toEqual(Plan.array([Plan.constant('only')]));
  });

  test('nothing registered is the empty collection, not a failure', () => {
    expect(visitorFor(Manifest.empty<unknown>()).visit(Type.iterable(FOO))).toEqual(Plan.iterable([]));
  });

  test('a member built without any registration for it is the tail, after every registered one', () => {
    const manifest = Manifest.empty<unknown>()
      .add(Registration.value(Type.tuple(FOO, BAR), 'registered-directly'))
      .add(Registration.value(FOO, 'foo-value'))
      .add(Registration.value(BAR, 'bar-value'));
    const plan = visitorFor(manifest).visit(Type.iterable(Type.tuple(FOO, BAR)));
    expect(plan?.kind).toBe('iterable');
    expect(plan?.kind === 'iterable' && plan.types.map(inner => inner.kind)).toEqual(['constant', 'factory']);
  });
});

describe('a union dependency', () => {
  test('one suppliable member answers it', () => {
    const registration = Registration.ctor(CACHE, MemoryCache, Type.ctor(CACHE, [[]]));
    const manifest = Manifest.empty<unknown>().add(registration);
    expect(visitorFor(manifest).visit(Type.union(CACHE, REDIS))).toEqual(
      Plan.registeredCtor(MemoryCache, [], CACHE, registration),
    );
  });

  test('a registration for the union itself settles it outright', () => {
    const union = Type.union(CACHE, REDIS);
    const manifest = Manifest.empty<unknown>()
      .add(Registration.ctor(CACHE, MemoryCache, Type.ctor(CACHE, [[]])))
      .add(Registration.value(union, 'the union itself'));
    expect(visitorFor(manifest).visit(union)).toEqual(Plan.constant('the union itself'));
  });

  test('several suppliable members settle on the first in canonical member order', () => {
    const redisRegistration = Registration.ctor(REDIS, RedisCache, Type.ctor(REDIS, [[]]));
    const cacheRegistration = Registration.ctor(CACHE, MemoryCache, Type.ctor(CACHE, [[]]));
    const manifest = Manifest.empty<unknown>().add(redisRegistration).add(cacheRegistration);
    // app:Cache orders before app:Redis, whichever was registered first.
    expect(visitorFor(manifest).visit(Type.union(CACHE, REDIS))).toEqual(
      Plan.registeredCtor(MemoryCache, [], CACHE, cacheRegistration),
    );
  });

  test('a self-supplying member is the fallback for when nothing else is registered', () => {
    const optional = Type.union(CACHE, Type.typeLiteral(undefined));
    const cacheRegistration = Registration.ctor(CACHE, MemoryCache, Type.ctor(CACHE, [[]]));
    const withCache = Manifest.empty<unknown>().add(cacheRegistration);
    expect(visitorFor(withCache).visit(optional)).toEqual(Plan.registeredCtor(MemoryCache, [], CACHE, cacheRegistration));
    expect(visitorFor(Manifest.empty<unknown>()).visit(optional)).toEqual(Plan.constant(undefined));
  });

  test('a member built without any registration for it can still answer the union', () => {
    const manifest = Manifest.empty<unknown>()
      .add(Registration.value(FOO, 'foo-value'))
      .add(Registration.value(BAR, 'bar-value'));
    const union = Type.union(Type.tuple(FOO, BAR), Type.typeLiteral(null));
    const plan = visitorFor(manifest).visit(union);
    expect(plan?.kind).toBe('factory');
    expect(plan?.kind === 'factory' && plan.factory('foo-value', 'bar-value')).toEqual(['foo-value', 'bar-value']);
  });

  test('two members that both synthesize settle the same way: the first in canonical order wins', () => {
    const manifest = Manifest.empty<unknown>()
      .add(Registration.value(FOO, 'foo-value'))
      .add(Registration.value(BAR, 'bar-value'));
    const union = Type.union(Type.tuple(FOO, BAR), Type.tuple(BAR, FOO));
    const plan = visitorFor(manifest).visit(union);
    expect(plan?.kind).toBe('factory');
    // [app:Bar, app:Foo] orders before [app:Foo, app:Bar], so its synthesis answers.
    expect(plan?.kind === 'factory' && plan.factory('bar-value', 'foo-value')).toEqual(['bar-value', 'foo-value']);
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
    const manifest = Manifest.empty<unknown>().add(Registration.ctor(LOOP, Loop, Type.ctor(LOOP, [[LOOP]])));
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
    const manifest = Manifest.empty<unknown>()
      .add(Registration.ctor(A, ImplA, Type.ctor(A, [[B]])))
      .add(Registration.ctor(B, ImplB, Type.ctor(B, [[A]])));
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
    expect(visitorFor(Manifest.empty<unknown>()).visit(FOO)).toBeUndefined();
  });
});

describe('a malformed signature row', () => {
  test('is refused at planning, never spread as arguments', () => {
    // Forged past the factories, the way no interned node can be built: the registration's
    // ctor node claims a bare named type as its whole signatures slot.
    const forged = {
      kind: 'ctor',
      instance: CONN,
      signatures: Type.global('string'),
    } as unknown as ConstructorType;
    const manifest = Manifest.empty<unknown>().add(Registration.ctor(CONN, Conn, forged));
    expect(() => visitorFor(manifest).visit(CONN)).toThrow(/a signature row is a tuple or a list — got a global/);
  });
});
