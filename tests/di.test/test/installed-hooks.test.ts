// Behaviour tests for the installed-hooks mechanism: staged hooks gated on the asks that
// activated them, installed hooks always active and outermost, disposal as the uninstall, and
// where construction hooks fire — registered nodes only, never engine-synthesised ones.

import type { Behavior, ControlService, GetService, Hooks } from '@rhombus-std/di.core';
import { ControlRequest, Registration } from '@rhombus-std/di.core';
import { Engine } from '@rhombus-std/di/private/internal/Engine';
import { ServiceProvider } from '@rhombus-std/di/private/ServiceProvider';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const DI_CORE = '@rhombus-std/di.core';
const CONTROL = Type.imported('ControlService', DI_CORE);
const CONN = Type.imported('Conn', 'app');

class Conn {}

/** An engine over `registrations` plus its head, terminating with a throw the way a built chain does. */
function engineFor(registrations: Iterable<Registration<unknown>>) {
  const engine = new Engine(registrations);
  const head: GetService = request =>
    engine.getService(request, () => {
      throw new Error('nothing beneath the engine');
    });
  const control = engine.getService(new ControlRequest(CONTROL), () => undefined) as ControlService;
  return { engine, head, control };
}

/** A provider wrapping `head` the way a scope layer does: every ask through it activates `handle`. */
function layerProvider(head: GetService, control: ControlService, hooks: Partial<Behavior>) {
  const handle = control.stageHooks(hooks);
  return { provider: new ServiceProvider(request => head(request.activate(handle))), handle };
}

/** A behavior logging each construction under `label` into `log`. */
function watching(label: string, log: string[]): Partial<Behavior> {
  return {
    beforeConstruct: (construction: Hooks.Construction) => {
      log.push(`${label}:${Type.stringify(construction.populatedAddress)}`);
      return { state: construction.state };
    },
  };
}

describe('staged vs installed hooks', () => {
  test("an ask through one layer never runs a parallel layer's staged hooks", () => {
    const log: string[] = [];
    const { head, control } = engineFor([Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]))]);
    const a = layerProvider(head, control, watching('a', log));
    const b = layerProvider(head, control, watching('b', log));

    a.provider.getService(CONN);
    expect(log).toEqual(['a:app:Conn']);

    log.length = 0;
    b.provider.getService(CONN);
    expect(log).toEqual(['b:app:Conn']);
  });

  test('installed hooks run for every ask, outermost, ahead of the staged layer', () => {
    const log: string[] = [];
    const { head, control } = engineFor([Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]))]);
    control.installHooks(watching('installed', log));
    const a = layerProvider(head, control, watching('staged', log));

    a.provider.getService(CONN);
    expect(log).toEqual(['installed:app:Conn', 'staged:app:Conn']);

    log.length = 0;
    new ServiceProvider(head).getService(CONN);
    expect(log).toEqual(['installed:app:Conn']);
  });

  test('disposing a handle uninstalls: a request still naming it fails its gate', () => {
    const log: string[] = [];
    const { head, control } = engineFor([Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]))]);
    const a = layerProvider(head, control, watching('a', log));

    a.provider.getService(CONN);
    a.handle[Symbol.dispose]();
    a.provider.getService(CONN);

    expect(log).toEqual(['a:app:Conn']);
  });

  test('disposing an installed handle stops it running for later asks', () => {
    const log: string[] = [];
    const { head, control } = engineFor([Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]))]);
    const handle = control.installHooks(watching('installed', log));
    const provider = new ServiceProvider(head);

    provider.getService(CONN);
    handle[Symbol.dispose]();
    provider.getService(CONN);

    expect(log).toEqual(['installed:app:Conn']);
  });

  test("a latebound minted inside a layer and invoked later still runs that layer's hooks", () => {
    const log: string[] = [];
    const { head, control } = engineFor([Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]))]);
    const a = layerProvider(head, control, watching('a', log));
    const b = layerProvider(head, control, watching('b', log));

    const make = a.provider.getService(Type.func(CONN, [[]])) as () => Conn;
    b.provider.getService(CONN);
    log.length = 0;

    expect(make()).toBeInstanceOf(Conn);
    expect(log).toEqual(['a:app:Conn']);
  });
});

describe('where construction hooks fire', () => {
  test('never at an engine-synthesised node — only the registered node beneath it', () => {
    const log: string[] = [];
    const { head, control } = engineFor([Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]))]);
    const a = layerProvider(head, control, watching('a', log));

    const shape = a.provider.getService(Type.object({ conn: CONN }));
    expect(shape.conn).toBeInstanceOf(Conn);
    expect(log).toEqual(['a:app:Conn']);
  });

  test('never at a seeded node, even inside a hooked ask', () => {
    const log: string[] = [];
    const provider2 = Type.imported('IServiceProvider', DI_CORE);
    const { head, control } = engineFor([Registration.factory(CONN, () => new Conn(), Type.func(CONN, [[provider2]]))]);
    const a = layerProvider(head, control, watching('a', log));

    a.provider.getService(CONN);
    expect(log).toEqual(['a:app:Conn']);
  });

  test("a user registration carrying a null lifetime is not the engine's — hooks still fire at and beneath it", () => {
    const log: string[] = [];
    const OUTER = Type.imported('Outer', 'app');
    const { head, control } = engineFor([
      Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]])),
      Registration.factory(OUTER, (conn: Conn) => ({ conn }), Type.func(OUTER, [[CONN]]), null),
    ]);
    control.installHooks(watching('installed', log));

    new ServiceProvider(head).getService(OUTER);
    expect(log).toEqual(['installed:app:Outer', 'installed:app:Conn']);
  });

  test('afterConstruct is skipped when beforeConstruct answered a result', () => {
    const after: string[] = [];
    let built = 0;
    const sentinel = new Conn();
    const { head, control } = engineFor([
      Registration.factory(CONN, () => {
        built++;
        return new Conn();
      }, Type.func(CONN, [[]])),
    ]);
    const a = layerProvider(head, control, {
      beforeConstruct: () => ({ result: sentinel }),
      afterConstruct: (construction: Hooks.Construction) => {
        after.push(Type.stringify(construction.populatedAddress));
      },
    });

    expect(a.provider.getService(CONN)).toBe(sentinel);
    expect(built).toBe(0);
    expect(after).toEqual([]);
  });

  test("beginResolve's answer arrives as each construction's state", () => {
    const states: unknown[] = [];
    const { head, control } = engineFor([Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]]))]);
    const a = layerProvider(head, control, {
      beginResolve: () => 'opened',
      beforeConstruct: (construction: Hooks.Construction) => {
        states.push(construction.state);
        return { state: construction.state };
      },
    });

    a.provider.getService(CONN);
    expect(states).toEqual(['opened']);
  });
});
