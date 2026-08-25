// Behaviour tests for RealizeVisitor: turning a CallSite tree into the value it describes. Sites
// are built by hand here through the CallSite factories, independent of what ToCallSiteVisitor
// would have produced, so each node kind is exercised on its own terms.

import { DefaultManifest, type IServiceProvider, LifetimeModel, ServiceDescriptor } from '@rhombus-std/di.core';
import { CallSite } from '@rhombus-std/di/private/internal/CallSite/CallSite';
import { realizeCallSite } from '@rhombus-std/di/private/internal/CallSite/RealizeVisitor';
import { Engine } from '@rhombus-std/di/private/internal/Engine';
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
const { realizer } = LifetimeModel.noop.createRealizer();

/** Seals `descriptors` into an Engine on the noop lifetime model — no scoping, no caching. */
function engineFor(descriptors: Iterable<ServiceDescriptor<unknown>>): Engine {
  return new Engine(realizer, undefined, descriptors);
}

const engine = engineFor(DefaultManifest.empty<unknown>());
const context = { engine, serviceProvider: provider, realizer };

describe('the leaf kinds', () => {
  test('constant returns its value untouched', () => {
    expect(realizeCallSite(CallSite.constant(42), context)).toBe(42);
  });

  test("service-provider returns the context's own facade", () => {
    expect(realizeCallSite(CallSite.serviceProvider(), context)).toBe(provider);
  });

  // Scope-opening realizes to the model's own ScopeFactory function now (see
  // standard-lifetime-model.test.ts / tagged-lifetime-model.test.ts) — the scope/lifetime
  // system is unbuilt here, so this stays dormant.
  test.skip('service-scope-factory realizes to a working scope opener', () => {});
});

describe('ctor and factory sites', () => {
  test('a ctor site `new`s its constructor over its realized args, depth-first', () => {
    const site = CallSite.ctor(Widget, [CallSite.ctor(Conn, [])]);
    const widget = realizeCallSite(site, context) as Widget;
    expect(widget).toBeInstanceOf(Widget);
    expect(widget.conn).toBeInstanceOf(Conn);
  });

  test('a factory site calls its function over its realized args', () => {
    const site = CallSite.factory((a: number, b: number) => a + b, [CallSite.constant(2), CallSite.constant(3)]);
    expect(realizeCallSite(site, context)).toBe(5);
  });
});

describe('iterable and array sites', () => {
  test('an array realizes every member eagerly, in order', () => {
    const site = CallSite.array([CallSite.constant(1), CallSite.constant(2), CallSite.constant(3)]);
    expect(realizeCallSite(site, context)).toEqual([1, 2, 3]);
  });

  test('an iterable realizes lazily, fresh on every walk', () => {
    let builds = 0;
    const site = CallSite.iterable([
      CallSite.factory(() => {
        builds++;
        return builds;
      }, []),
    ]);
    const values = realizeCallSite(site, context);
    expect([...values]).toEqual([1]);
    expect([...values]).toEqual([2]);
  });
});

describe('a late-bound site', () => {
  test('returns a function that re-enters the engine with its call args registered', () => {
    const manifest = DefaultManifest.empty<unknown>().add(
      ServiceDescriptor.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CONN]]), 'singleton'),
    );
    const lateBoundEngine = engineFor(manifest);
    const site = CallSite.latebound(Type.func(WIDGET, [[CONN]]));
    const make = realizeCallSite(site, { engine: lateBoundEngine, serviceProvider: provider, realizer }) as (
      conn: unknown,
    ) => Widget;
    const conn = new Conn();
    const widget = make(conn);
    expect(widget).toBeInstanceOf(Widget);
    expect(widget.conn).toBe(conn);
  });

  test("binds the call's arguments under the signature whose length matches the call", () => {
    const lateBoundEngine = engineFor(DefaultManifest.empty<unknown>());
    const site = CallSite.latebound(Type.func(CONN, [[CONN, BAR], [CONN]]));
    const call = realizeCallSite(site, { engine: lateBoundEngine, serviceProvider: provider, realizer }) as (
      ...args: unknown[]
    ) => unknown;
    const conn = new Conn();
    expect(call(conn)).toBe(conn);
  });

  test('throws when no signature accepts the call arity — nothing falls back silently', () => {
    const lateBoundEngine = engineFor(DefaultManifest.empty<unknown>());
    const site = CallSite.latebound(Type.func(CONN, [[CONN, BAR], [CONN]]));
    const call = realizeCallSite(site, { engine: lateBoundEngine, serviceProvider: provider, realizer }) as (
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
  test.skip('a lifetime-tagged site realizes once per scope and is cached for the next ask', () => {});
  test.skip("a fresh scope never sees another scope's cached value", () => {});
  test.skip('no scope in the walk means no caching, even with a lifetime tag', () => {});
  test.skip('no lifetime on the site means no caching, even inside a scope', () => {});
});
