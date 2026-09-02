// Behaviour tests for the engine's door: which asks it answers itself and which it hands
// through `next`. A bare engine takes an explicit `next` here, so each side of the split is
// pinned without a builder or a lifetime model in the frame; the last case goes through the
// builder, where the chain's terminus is what stands beneath.

import { Builder } from '@rhombus-std/di';
import { Control, Registration, type Request, UnsatisfiableError } from '@rhombus-std/di.core';
import { Engine } from '@rhombus-std/di/private/internal/Engine';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const CONN = Type.imported('Conn', 'app');
const WIDGET = Type.imported('Widget', 'app');
const MISSING = Type.imported('Missing', 'app');

/** An address still carrying a hole — nobody's registration, whatever is filed. */
const OPEN_BOX = Type.imported('Box', 'app', [Type.generic('T')]);

const DI_CORE = '@rhombus-std/di.core';

/** A control ask the engine does not own: `Control` around a service nothing answers. */
const UNOWNED_CONTROL = Type.imported('Control', DI_CORE, [MISSING]);

/** The engine-owned roster ask, `Control<Iterable<Registration<unknown>>>`. */
const ROSTER_CONTROL = Type.imported('Control', DI_CORE, [
  Type.iterable(Type.imported('Registration', DI_CORE, [Type.global('unknown')])),
]);

class Conn {}
class Widget {
  constructor(readonly conn: unknown) {}
}

/** A request for `address` — none of these tests read `serviceProvider`. */
function requestFor(address: Type): Request {
  return { type: address, serviceProvider: undefined as unknown as Request['serviceProvider'] };
}

describe('what the engine answers itself', () => {
  test('a registered ask is answered in place; nothing reaches next', () => {
    const engine = new Engine([Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]))]);
    const seen: Request[] = [];

    const answer = engine.getService(requestFor(CONN), request => {
      seen.push(request);
      return undefined;
    });

    expect(answer).toBeInstanceOf(Conn);
    expect(seen).toEqual([]);
  });

  test('registered but unbuildable throws instead of delegating', () => {
    const engine = new Engine([Registration.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CONN]]))]);
    const seen: Request[] = [];
    const ask = () =>
      engine.getService(requestFor(WIDGET), request => {
        seen.push(request);
        return undefined;
      });

    expect(ask).toThrow(UnsatisfiableError);
    expect(ask).toThrow('it is registered, but something it needs is not');
    expect(seen).toEqual([]);
  });

  test('the roster control comes back from the engine without consulting next', () => {
    const registration = Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]));
    const engine = new Engine([registration]);
    const seen: Request[] = [];

    const answer = engine.getService(requestFor(ROSTER_CONTROL), request => {
      seen.push(request);
      return undefined;
    });

    expect(answer).toBeInstanceOf(Control);
    expect([...answer.service]).toEqual([registration]);
    expect(seen).toEqual([]);
  });

  test('an unregistered object ask synthesizes from registered members before any delegation', () => {
    const engine = new Engine([Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]))]);
    const seen: Request[] = [];

    const answer = engine.getService(requestFor(Type.object({ conn: CONN })), request => {
      seen.push(request);
      return undefined;
    });

    expect(answer.conn).toBeInstanceOf(Conn);
    expect(seen).toEqual([]);
  });
});

describe('what flows through next', () => {
  test('an unregistered ask delegates once, same request, answer returned verbatim', () => {
    const engine = new Engine([]);
    const beneath = { answered: 'beneath the engine' };
    const seen: Request[] = [];
    const request = requestFor(MISSING);

    const answer = engine.getService(request, delegated => {
      seen.push(delegated);
      return beneath;
    });

    expect(answer).toBe(beneath);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(request);
  });

  test('an open ask binds no registration and delegates', () => {
    const engine = new Engine([Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]))]);
    const beneath = { answered: 'beneath the engine' };
    const seen: Request[] = [];

    const answer = engine.getService(requestFor(OPEN_BOX), request => {
      seen.push(request);
      return beneath;
    });

    expect(answer).toBe(beneath);
    expect(seen).toHaveLength(1);
  });

  test('a control ask the engine does not own delegates like any other', () => {
    const engine = new Engine([Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]))]);
    const beneath = { answered: 'beneath the engine' };
    const seen: Request[] = [];

    const answer = engine.getService(requestFor(UNOWNED_CONTROL), request => {
      seen.push(request);
      return beneath;
    });

    expect(answer).toBe(beneath);
    expect(seen).toHaveLength(1);
  });
});

describe('the chain terminus', () => {
  test('a built provider refuses an unregistered ask with the terminus reason', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.value(CONN, new Conn()))).build();
    const ask = () => provider.getService(MISSING);

    expect(ask).toThrow(UnsatisfiableError);
    expect(ask).toThrow('nothing in the manifest produces it');
  });
});
