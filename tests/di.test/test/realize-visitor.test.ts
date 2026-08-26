// Behaviour tests for RealizeVisitor: turning a Plan tree into the value it describes. Plans
// are built by hand here through the Plan factories, independent of what ToPlanVisitor
// would have produced, so each node kind is exercised on its own terms.

import { noop } from '@rhombus-std/di';
import { type IServiceProvider, Manifest, Registration } from '@rhombus-std/di.core';
import { Engine } from '@rhombus-std/di/private/internal/Engine';
import { Plan } from '@rhombus-std/di/private/internal/Plan/Plan';
import { realizePlan } from '@rhombus-std/di/private/internal/Plan/RealizeVisitor';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const CONN = Type.imported('Conn', 'app');
const WIDGET = Type.imported('Widget', 'app');
const BAR = Type.imported('Bar', 'app');

class Conn {}
class Widget {
  constructor(readonly conn: unknown) {}
}

const provider = {} as IServiceProvider;
const { realizer } = noop().createRealizer();

/** Seals `registrations` into an Engine on the noop lifetime model — no scoping, no caching. */
function engineFor(registrations: Iterable<Registration<unknown>>): Engine {
  return new Engine(realizer, registrations);
}

const engine = engineFor(Manifest.empty<unknown>());
const context = { engine, serviceProvider: provider, realizer };

describe('the leaf kinds', () => {
  test('constant returns its value untouched', () => {
    expect(realizePlan(Plan.constant(42), context)).toBe(42);
  });

  test("service-provider returns the context's own facade", () => {
    expect(realizePlan(Plan.serviceProvider(), context)).toBe(provider);
  });

  // Scope-opening realizes to the model's own ScopeFactory function now (see
  // standard-lifetime-model.test.ts / tagged-lifetime-model.test.ts) — the scope/lifetime
  // system is unbuilt here, so this stays dormant.
  test.skip('service-scope-factory realizes to a working scope opener', () => {});
});

describe('ctor and factory plans', () => {
  test('a ctor plan `new`s its constructor over its realized args, depth-first', () => {
    const plan = Plan.ctor(Widget, [Plan.ctor(Conn, [])]);
    const widget = realizePlan(plan, context) as Widget;
    expect(widget).toBeInstanceOf(Widget);
    expect(widget.conn).toBeInstanceOf(Conn);
  });

  test('a factory plan calls its function over its realized args', () => {
    const plan = Plan.factory((a: number, b: number) => a + b, [Plan.constant(2), Plan.constant(3)]);
    expect(realizePlan(plan, context)).toBe(5);
  });
});

describe('iterable and array plans', () => {
  test('an array realizes every member eagerly, in order', () => {
    const plan = Plan.array([Plan.constant(1), Plan.constant(2), Plan.constant(3)]);
    expect(realizePlan(plan, context)).toEqual([1, 2, 3]);
  });

  test('an iterable realizes lazily, fresh on every walk', () => {
    let builds = 0;
    const plan = Plan.iterable([
      Plan.factory(() => {
        builds++;
        return builds;
      }, []),
    ]);
    const values = realizePlan(plan, context);
    expect([...values]).toEqual([1]);
    expect([...values]).toEqual([2]);
  });
});

describe('a late-bound plan', () => {
  test('returns a function that re-enters the engine with its call args registered', () => {
    const manifest = Manifest.empty<unknown>().add(
      Registration.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CONN]]), 'singleton'),
    );
    const lateBoundEngine = engineFor(manifest);
    const plan = Plan.latebound(Type.func(WIDGET, [[CONN]]));
    const make = realizePlan(plan, { engine: lateBoundEngine, serviceProvider: provider, realizer }) as (
      conn: unknown,
    ) => Widget;
    const conn = new Conn();
    const widget = make(conn);
    expect(widget).toBeInstanceOf(Widget);
    expect(widget.conn).toBe(conn);
  });

  test("binds the call's arguments under the signature whose length matches the call", () => {
    const lateBoundEngine = engineFor(Manifest.empty<unknown>());
    const plan = Plan.latebound(Type.func(CONN, [[CONN, BAR], [CONN]]));
    const call = realizePlan(plan, { engine: lateBoundEngine, serviceProvider: provider, realizer }) as (
      ...args: unknown[]
    ) => unknown;
    const conn = new Conn();
    expect(call(conn)).toBe(conn);
  });

  test('throws when no signature accepts the call arity — nothing falls back silently', () => {
    const lateBoundEngine = engineFor(Manifest.empty<unknown>());
    const plan = Plan.latebound(Type.func(CONN, [[CONN, BAR], [CONN]]));
    const call = realizePlan(plan, { engine: lateBoundEngine, serviceProvider: provider, realizer }) as (
      ...args: unknown[]
    ) => unknown;
    const conn = new Conn();
    expect(() => call(conn, 'extra', 'args')).toThrow(TypeError);
  });
});

// The scope/lifetime system is unbuilt here — ServiceScope/ServiceScopeFactory no longer exist;
// per-scope caching now lives entirely in the lifetime models themselves (see
// standard-lifetime-model.test.ts / tagged-lifetime-model.test.ts).
describe.skip('scoped caching', () => {
  test.skip('a lifetime-tagged plan realizes once per scope and is cached for the next ask', () => {});
  test.skip("a fresh scope never sees another scope's cached value", () => {});
  test.skip('no scope in the walk means no caching, even with a lifetime tag', () => {});
  test.skip('no lifetime on the plan means no caching, even inside a scope', () => {});
});
