// Behaviour tests for RealizeVisitor: turning a Plan tree into the value it describes. Plans
// are built by hand here through the Plan factories, independent of what PlannerVisitor
// would have produced, so each node kind is exercised on its own terms.

import { HookChain, Manifest, Registration, type Request } from '@rhombus-std/di.core';
import { Engine } from '@rhombus-std/di/private/internal/Engine';
import { Plan } from '@rhombus-std/di/private/internal/Plan/Plan';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const CONN = Type.imported('Conn', 'app');
const WIDGET = Type.imported('Widget', 'app');
const BAR = Type.imported('Bar', 'app');

class Conn {}
class Widget {
  constructor(readonly conn: unknown) {}
}

/** Seals `registrations` into an Engine — nothing binds hooks here, so no scope keeps anything. */
function engineFor(registrations: Iterable<Registration<unknown>>): Engine {
  return new Engine(registrations);
}

/** The request these tests realize under — nothing here reads `type` or `serviceProvider`. */
const request: Request = { type: Type.imported('Placeholder', 'app'), serviceProvider: undefined as unknown as Request['serviceProvider'] };

/** Realizes `plan` against `engine`, through the chain that neither intercepts nor transforms. */
function realize(plan: Plan, engine: Engine): any {
  return Plan.realize(plan, { engine, chain: HookChain.identity, context: { states: [] }, request });
}

const engine = engineFor(Manifest.empty<unknown>());

describe('the leaf kinds', () => {
  test('constant returns its value untouched', () => {
    expect(realize(Plan.constant(42), engine)).toBe(42);
  });

  // IServiceProvider is an ordinary registration under `controlLifetime`, seeded by the lifetime
  // model and answered by the engine directly — there is no plan kind of its own to exercise here.

  // Scope-opening is a registration each model publishes at its own address (see
  // standard-lifetime-model.test.ts / tagged-lifetime-model.test.ts), so no plan kind of its
  // own reaches here.
  test.skip('service-scope-factory realizes to a working scope opener', () => {});
});

describe('ctor and factory plans', () => {
  test('a ctor plan `new`s its constructor over its realized args, depth-first', () => {
    const plan = Plan.ctor(Widget, [Plan.ctor(Conn, [])]);
    const widget = realize(plan, engine) as Widget;
    expect(widget).toBeInstanceOf(Widget);
    expect(widget.conn).toBeInstanceOf(Conn);
  });

  test('a factory plan calls its function over its realized args', () => {
    const plan = Plan.factory((a: number, b: number) => a + b, [Plan.constant(2), Plan.constant(3)]);
    expect(realize(plan, engine)).toBe(5);
  });
});

describe('iterable and array plans', () => {
  test('an array realizes every member eagerly, in order', () => {
    const plan = Plan.array([Plan.constant(1), Plan.constant(2), Plan.constant(3)]);
    expect(realize(plan, engine)).toEqual([1, 2, 3]);
  });

  test('an iterable realizes lazily, fresh on every walk', () => {
    let builds = 0;
    const plan = Plan.iterable([
      Plan.factory(() => {
        builds++;
        return builds;
      }, []),
    ]);
    const values = realize(plan, engine);
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
    const make = realize(plan, lateBoundEngine) as (conn: unknown) => Widget;
    const conn = new Conn();
    const widget = make(conn);
    expect(widget).toBeInstanceOf(Widget);
    expect(widget.conn).toBe(conn);
  });

  test("binds the call's arguments under the signature whose length matches the call", () => {
    const lateBoundEngine = engineFor(Manifest.empty<unknown>());
    const plan = Plan.latebound(Type.func(CONN, [[CONN, BAR], [CONN]]));
    const call = realize(plan, lateBoundEngine) as (...args: unknown[]) => unknown;
    const conn = new Conn();
    expect(call(conn)).toBe(conn);
  });

  test('throws when no signature accepts the call arity — nothing falls back silently', () => {
    const lateBoundEngine = engineFor(Manifest.empty<unknown>());
    const plan = Plan.latebound(Type.func(CONN, [[CONN, BAR], [CONN]]));
    const call = realize(plan, lateBoundEngine) as (...args: unknown[]) => unknown;
    const conn = new Conn();
    expect(() => call(conn, 'extra', 'args')).toThrow(TypeError);
  });
});

// Per-scope caching lives entirely in the lifetime models (see standard-lifetime-model.test.ts /
// tagged-lifetime-model.test.ts), so the visitor has nothing of its own to pin down here.
describe.skip('scoped caching', () => {
  test.skip('a lifetime-tagged plan realizes once per scope and is cached for the next ask', () => {});
  test.skip("a fresh scope never sees another scope's cached value", () => {});
  test.skip('no scope in the walk means no caching, even with a lifetime tag', () => {});
  test.skip('no lifetime on the plan means no caching, even inside a scope', () => {});
});
