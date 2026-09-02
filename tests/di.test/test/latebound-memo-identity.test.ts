// Behaviour tests for the plan memo behind a latebound call: the plan is keyed on the return
// address plus the arg-type row the call binds, so two callables answering to the same padded row
// share nothing unless they also share the address, and a repeated arity against one callable
// hits the memo instead of planning again.

import { HookChain, Manifest, Registration, type Request } from '@rhombus-std/di.core';
import { Engine } from '@rhombus-std/di/private/internal/Engine';
import { Plan } from '@rhombus-std/di/private/internal/Plan/Plan';
import { PlannerVisitor } from '@rhombus-std/di/private/internal/Plan/PlannerVisitor';
import { type FunctionType, Type } from '@rhombus-std/primitives';
import { afterEach, describe, expect, spyOn, test } from 'bun:test';

/** The request these tests realize under — nothing here reads `type` or `serviceProvider`. */
const request: Request = { type: Type.imported('Placeholder', 'app'), serviceProvider: undefined as unknown as Request['serviceProvider'] };

/** An engine over `manifest`, answering a latebound function type with the function it realizes to. */
function toProvider(manifest: Manifest<string>) {
  const engine = new Engine(manifest);
  return {
    resolve(funcType: FunctionType): unknown {
      return Plan.realize(Plan.latebound(funcType), { engine, chain: HookChain.identity, context: { states: [] }, request });
    },
  };
}

const CONN = Type.imported('Conn', 'app');
const WIDGET = Type.imported('Widget', 'app');
const GADGET = Type.imported('Gadget', 'app');
const SINK = Type.imported('Sink', 'app');

class Conn {}
class Sink {
  readonly rest: unknown[];
  constructor(...rest: unknown[]) {
    this.rest = rest;
  }
}
class Widget {
  readonly rest: unknown[];
  constructor(readonly conn: unknown, ...rest: unknown[]) {
    this.rest = rest;
  }
}
class Gadget {
  readonly rest: unknown[];
  constructor(readonly conn: unknown, ...rest: unknown[]) {
    this.rest = rest;
  }
}

/** `[Conn, ...Conn[]]` — the same open row for both constructors. */
const OPEN_ROW = Type.tuple({ members: [CONN], rest: CONN });

const both = Manifest.empty<string>()
  .add(Registration.ctor(WIDGET, Widget, Type.ctor(WIDGET, OPEN_ROW), 'singleton'))
  .add(Registration.ctor(GADGET, Gadget, Type.ctor(GADGET, OPEN_ROW), 'singleton'))
  .add(Registration.ctor(SINK, Sink, Type.ctor(SINK, Type.array(CONN)), 'singleton'))
  .add(Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]), 'singleton'));

const spies: ReturnType<typeof spyOn>[] = [];
afterEach(() => {
  for (const spy of spies.splice(0)) {
    spy.mockRestore();
  }
});

/** How many times the planner was asked to plan `address` from the top. */
function plannerBuilds(address: Type) {
  const spy = spyOn(PlannerVisitor.prototype, 'visit');
  spies.push(spy);
  return () => spy.mock.calls.filter(([type]) => type === address).length;
}

describe('two callables padding to the same row', () => {
  test('share the interned row array', () => {
    const provider = toProvider(both);
    const makeWidget = provider.resolve(Type.func(WIDGET, OPEN_ROW)) as (...conns: unknown[]) => Widget;
    const makeGadget = provider.resolve(Type.func(GADGET, OPEN_ROW)) as (...conns: unknown[]) => Gadget;
    const a = new Conn();
    const b = new Conn();
    const c = new Conn();

    const widget = makeWidget(a, b, c);
    const gadget = makeGadget(a, b, c);
    expect(widget).toBeInstanceOf(Widget);
    expect(gadget).toBeInstanceOf(Gadget);
    expect(widget.conn).toBe(a);
    expect(gadget.conn).toBe(a);
  });

  test('never serve one address the plan of the other', () => {
    const provider = toProvider(both);
    const widgetBuilds = plannerBuilds(WIDGET);
    const gadgetBuilds = plannerBuilds(GADGET);
    const makeWidget = provider.resolve(Type.func(WIDGET, OPEN_ROW)) as (...conns: unknown[]) => Widget;
    const makeGadget = provider.resolve(Type.func(GADGET, OPEN_ROW)) as (...conns: unknown[]) => Gadget;

    makeWidget(new Conn(), new Conn(), new Conn());
    expect(widgetBuilds()).toBe(1);
    expect(gadgetBuilds()).toBe(0);
    makeGadget(new Conn(), new Conn(), new Conn());
    expect(widgetBuilds()).toBe(1);
    expect(gadgetBuilds()).toBe(1);
  });
});

describe('a repeated arity against one callable', () => {
  test('hits the memo — the plan is built once per arity', () => {
    const provider = toProvider(both);
    const builds = plannerBuilds(WIDGET);
    const make = provider.resolve(Type.func(WIDGET, OPEN_ROW)) as (...conns: unknown[]) => Widget;

    make(new Conn(), new Conn(), new Conn());
    make(new Conn(), new Conn(), new Conn());
    expect(builds()).toBe(1);
    make(new Conn(), new Conn(), new Conn(), new Conn());
    expect(builds()).toBe(2);
    make(new Conn());
    expect(builds()).toBe(3);
    make(new Conn());
    expect(builds()).toBe(3);
  });
});

describe('a rest-only row called with no args', () => {
  test('hits the memo — the empty row binds one interned identity', () => {
    const provider = toProvider(both);
    const builds = plannerBuilds(SINK);
    const make = provider.resolve(Type.func(SINK, Type.array(CONN))) as (...conns: unknown[]) => Sink;

    make();
    make();
    expect(builds()).toBe(1);
    make(new Conn());
    make(new Conn());
    expect(builds()).toBe(2);
  });
});

describe('the interned row array', () => {
  test('is one identity however it is spelled', () => {
    const spelled = Type.tuple({ members: [CONN, WIDGET] }).members;
    expect(Type.tuple({ members: [CONN, WIDGET] }).members).toBe(spelled);
    expect(Type.tuple(CONN, WIDGET).members).toBe(spelled);
    expect(Type.tuple(...[CONN], ...Array.from({ length: 1 }, () => WIDGET)).members).toBe(spelled);
  });

  test('is frozen, so nothing can grow or reorder it', () => {
    const members = Type.tuple(CONN, WIDGET).members as Type[];
    expect(Object.isFrozen(members)).toBe(true);
    expect(() => members.push(CONN)).toThrow();
    expect(() => {
      members[0] = WIDGET;
    }).toThrow();
    expect(members).toEqual([CONN, WIDGET]);
  });
});
