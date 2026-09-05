// Black-box behavior tests for the container-agnostic floor: every case here uses only
// capabilities any mainstream constructor-injection container offers — construction with
// injected dependencies, last-registration-wins, factories taking the provider, collection
// resolution in registration order, keyed addresses, open generics, cycle refusal — and asserts
// nothing about this engine's own extensions. The request classes, hooks, delegation and
// shadowing-resolves-beneath live in their own suites; a self-referential registration in
// particular is NOT here, because this container decorates where others refuse.

import { Builder } from '@rhombus-std/di';
import { CycleError, type IServiceProvider, Registration, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const PROVIDER = Type.imported('IServiceProvider', '@rhombus-std/di.core');

const CONN = Type.imported('Conn', 'app');
const WIDGET = Type.imported('Widget', 'app');
const GREETING = Type.imported('IGreeting', 'app');
const STORE = Type.imported('IStore', 'app');
const MISSING = Type.imported('Missing', 'app');

class Conn {}
class Widget {
  constructor(readonly conn: unknown) {}
}

describe('registration and resolution', () => {
  test('a constructor registration resolves with its dependencies injected', () => {
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]])))
        .add(Registration.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CONN]])))
    ).build();

    const widget = provider.getService(WIDGET) as Widget;
    expect(widget).toBeInstanceOf(Widget);
    expect(widget.conn).toBeInstanceOf(Conn);
  });

  test('an unkept constructor registration builds afresh on every resolve', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]])))).build();

    expect(provider.getService(CONN)).not.toBe(provider.getService(CONN));
  });

  test('a value registration hands back the same instance every resolve', () => {
    const conn = new Conn();
    const provider = Builder.withServices(manifest => manifest.add(Registration.value(CONN, conn))).build();

    expect(provider.getService(CONN)).toBe(conn);
    expect(provider.getService(CONN)).toBe(conn);
  });

  test('a factory registration taking the provider resolves its own dependencies through it', () => {
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.ctor(CONN, Conn, Type.ctor(CONN, [[]])))
        .add(Registration.factory(WIDGET, (resolver: IServiceProvider) => new Widget(resolver.getService(CONN)), Type.func(WIDGET, [[PROVIDER]])))
    ).build();

    const widget = provider.getService(WIDGET) as Widget;
    expect(widget).toBeInstanceOf(Widget);
    expect(widget.conn).toBeInstanceOf(Conn);
  });

  test('the last registration at an address wins a single resolve', () => {
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.value(GREETING, 'first'))
        .add(Registration.value(GREETING, 'second'))
    ).build();

    expect(provider.getService(GREETING)).toBe('second');
  });

  test('an unregistered address refuses to resolve', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.value(CONN, new Conn()))).build();

    expect(() => provider.getService(MISSING)).toThrow(UnsatisfiableError);
  });
});

describe('collections', () => {
  test('a collection ask yields every registration in the order they were added', () => {
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.value(GREETING, 'formal'))
        .add(Registration.value(GREETING, 'casual'))
    ).build();

    expect([...provider.getService(Type.iterable(GREETING))]).toEqual(['formal', 'casual']);
    expect(provider.getService(Type.array(GREETING))).toEqual(['formal', 'casual']);
  });

  test('an unregistered element type yields an empty collection while the bare address still refuses', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.value(CONN, new Conn()))).build();

    expect([...provider.getService(Type.iterable(MISSING))]).toEqual([]);
    expect(() => provider.getService(MISSING)).toThrow(UnsatisfiableError);
  });
});

describe('keyed registrations', () => {
  test('a keyed registration resolves by its key, and neither side sees the other', () => {
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.value(STORE, 'plain'))
        .add(Registration.value(Type.tag(STORE, 'sql'), 'sql-store'))
    ).build();

    expect(provider.getService(STORE)).toBe('plain');
    expect(provider.getService(Type.tag(STORE, 'sql'))).toBe('sql-store');
    expect([...provider.getService(Type.iterable(STORE))]).toEqual(['plain']);
  });
});

describe('open generics', () => {
  test('one open registration answers every closing', () => {
    const open = Type.imported('IRepo', 'app', [Type.generic('T')]);
    class Repo {}
    const provider = Builder.withServices(manifest => manifest.add(Registration.ctor(open, Repo, Type.ctor(Type.imported('Repo', 'app', [Type.generic('T')]), [[]])))).build();

    expect(provider.getService(Type.imported('IRepo', 'app', [CONN]))).toBeInstanceOf(Repo);
    expect(provider.getService(Type.imported('IRepo', 'app', [WIDGET]))).toBeInstanceOf(Repo);
  });
});

describe('cycles', () => {
  test('two registrations depending on each other refuse with a cycle', () => {
    const A = Type.imported('A', 'app');
    const B = Type.imported('B', 'app');
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.factory(A, (b: unknown) => b, Type.func(A, [[B]])))
        .add(Registration.factory(B, (a: unknown) => a, Type.func(B, [[A]])))
    ).build();

    expect(() => provider.getService(A)).toThrow(CycleError);
  });
});

describe('the provider as a service', () => {
  test('a constructor parameter typed as the provider receives a working one', () => {
    class Router {
      constructor(readonly resolver: IServiceProvider) {}
    }
    const ROUTER = Type.imported('Router', 'app');
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.value(CONN, new Conn()))
        .add(Registration.ctor(ROUTER, Router, Type.ctor(ROUTER, [[PROVIDER]])))
    ).build();

    const router = provider.getService(ROUTER) as Router;
    expect(router.resolver.getService(CONN)).toBeInstanceOf(Conn);
  });
});
