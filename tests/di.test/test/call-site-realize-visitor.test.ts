// Behaviour tests for RealizeVisitor: turning a CallSite tree into the value it describes. Sites
// are built by hand here through the CallSite factories, independent of what ToCallSiteVisitor
// would have produced, so each node kind is exercised on its own terms.

import { DefaultManifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { CallSite } from '@rhombus-std/di/private/internal/CallSite/CallSite';
import { realizeCallSite } from '@rhombus-std/di/private/internal/CallSite/RealizeVisitor';
import { Engine } from '@rhombus-std/di/private/internal/Engine';
import { ServiceScope, ServiceScopeFactory } from '@rhombus-std/di/private/internal/ServiceScope';
import { type IServiceProvider, Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const CONN = Type.imported('Conn', 'app');
const WIDGET = Type.imported('Widget', 'app');
const BAR = Type.imported('Bar', 'app');

class Conn {}
class Widget {
  constructor(readonly conn: unknown) {}
}

const provider = {} as IServiceProvider;
const engine = new Engine(DefaultManifest.empty<string>());
const context = { engine, serviceProvider: provider };

describe('the leaf kinds', () => {
  test('constant returns its value untouched', () => {
    expect(realizeCallSite(CallSite.constant(42), context)).toBe(42);
  });

  test("service-provider returns the context's own facade", () => {
    expect(realizeCallSite(CallSite.serviceProvider(), context)).toBe(provider);
  });

  test('service-scope-factory realizes to a working scope opener', () => {
    const manifest = DefaultManifest.empty<string>().add(ServiceDescriptor.ctor(CONN, Conn, Type.ctor(CONN, [[]])));
    const scopedEngine = new Engine(manifest);
    const factory = realizeCallSite(CallSite.serviceScopeFactory(), { engine: scopedEngine,
      serviceProvider: provider });
    expect(factory).toBeInstanceOf(ServiceScopeFactory);
    const scope = (factory as ServiceScopeFactory).createScope();
    expect(scope.getRequiredService(CONN)).toBeInstanceOf(Conn);
  });
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
    const manifest = DefaultManifest.empty<string>().add(
      ServiceDescriptor.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CONN]])),
    );
    const lateBoundEngine = new Engine(manifest);
    const site = CallSite.latebound(WIDGET, [[CONN]]);
    const make = realizeCallSite(site, { engine: lateBoundEngine, serviceProvider: provider }) as (
      conn: unknown,
    ) => Widget;
    const conn = new Conn();
    const widget = make(conn);
    expect(widget).toBeInstanceOf(Widget);
    expect(widget.conn).toBe(conn);
  });

  test("binds the call's arguments under the row whose length matches the call", () => {
    const lateBoundEngine = new Engine(DefaultManifest.empty<string>());
    const site = CallSite.latebound(CONN, [[CONN, BAR], [CONN]]);
    const call = realizeCallSite(site, { engine: lateBoundEngine, serviceProvider: provider }) as (
      ...args: unknown[]
    ) => unknown;
    const conn = new Conn();
    expect(call(conn)).toBe(conn);
  });

  test("falls back to the first row when no row's length matches the call", () => {
    const lateBoundEngine = new Engine(DefaultManifest.empty<string>());
    const site = CallSite.latebound(CONN, [[CONN, BAR], [CONN]]);
    const call = realizeCallSite(site, { engine: lateBoundEngine, serviceProvider: provider }) as (
      ...args: unknown[]
    ) => unknown;
    const conn = new Conn();
    expect(call(conn, 'extra', 'args')).toBe(conn);
  });
});

describe('scoped caching', () => {
  test('a lifetime-tagged site realizes once per scope and is cached for the next ask', () => {
    let builds = 0;
    class Counted {
      constructor() {
        builds++;
      }
    }
    const descriptor = ServiceDescriptor.ctor(WIDGET, Counted, Type.ctor(WIDGET, [[]]), 'singleton');
    const site = CallSite.ctor(Counted, [], descriptor);
    const scope = new ServiceScope(engine, provider);
    const first = realizeCallSite(site, { engine, serviceProvider: provider, scope });
    const second = realizeCallSite(site, { engine, serviceProvider: provider, scope });
    expect(first).toBe(second);
    expect(builds).toBe(1);
  });

  test("a fresh scope never sees another scope's cached value", () => {
    class Counted {}
    const descriptor = ServiceDescriptor.ctor(WIDGET, Counted, Type.ctor(WIDGET, [[]]), 'singleton');
    const site = CallSite.ctor(Counted, [], descriptor);
    const scopeA = new ServiceScope(engine, provider);
    const scopeB = new ServiceScope(engine, provider);
    const a = realizeCallSite(site, { engine, serviceProvider: provider, scope: scopeA });
    const b = realizeCallSite(site, { engine, serviceProvider: provider, scope: scopeB });
    expect(a).not.toBe(b);
  });

  test('no scope in the walk means no caching, even with a lifetime tag', () => {
    class Counted {}
    const descriptor = ServiceDescriptor.ctor(WIDGET, Counted, Type.ctor(WIDGET, [[]]), 'singleton');
    const site = CallSite.ctor(Counted, [], descriptor);
    const first = realizeCallSite(site, context);
    const second = realizeCallSite(site, context);
    expect(first).not.toBe(second);
  });

  test('no lifetime on the site means no caching, even inside a scope', () => {
    class Counted {}
    const site = CallSite.ctor(Counted, []);
    const scope = new ServiceScope(engine, provider);
    const first = realizeCallSite(site, { engine, serviceProvider: provider, scope });
    const second = realizeCallSite(site, { engine, serviceProvider: provider, scope });
    expect(first).not.toBe(second);
  });
});
