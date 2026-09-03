// Behaviour tests for the request door: the request classes as resolvable addresses, the
// engine's two seeded registrations, and shadowing — a user registration beating a seed, and a
// self-named slot resolving beneath its own registration.

import { Builder } from '@rhombus-std/di';
import { ControlRequest, type ControlService, CycleError, type IServiceProvider, Registration, Request, ServiceRequest, UnsatisfiableError } from '@rhombus-std/di.core';
import { Engine } from '@rhombus-std/di/private/internal/Engine';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const DI_CORE = '@rhombus-std/di.core';
const PROVIDER = Type.imported('IServiceProvider', DI_CORE);
const REQUEST = Type.imported('Request', DI_CORE);
const SERVICE_REQUEST = Type.imported('ServiceRequest', DI_CORE);
const CONTROL = Type.imported('ControlService', DI_CORE);

const CONN = Type.imported('Conn', 'app');
const FOO = Type.imported('Foo', 'app');
const BAR = Type.imported('Bar', 'app');

class Conn {}
class Foo {}
class Bar {}

describe('the request as an address', () => {
  test("a factory slot naming ServiceRequest receives the ask's own request", () => {
    const seen: ServiceRequest[] = [];
    const factory = (request: ServiceRequest) => {
      seen.push(request);
      return new Conn();
    };
    const provider = Builder.withServices(manifest => manifest.add(Registration.factory(CONN, factory, Type.func(CONN, [[SERVICE_REQUEST]])))).build();

    expect(provider.getService(CONN)).toBeInstanceOf(Conn);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toBeInstanceOf(ServiceRequest);
    expect(seen[0]!.address).toBe(CONN);
    expect(seen[0]!.serviceProvider).toBe(provider);
  });

  test('the request is not registered: a user registration at a request address still answers first', () => {
    const mine = { type: BAR } as unknown as ServiceRequest;
    const seen: ServiceRequest[] = [];
    const factory = (request: ServiceRequest) => {
      seen.push(request);
      return new Conn();
    };
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.value(SERVICE_REQUEST, mine))
        .add(Registration.factory(CONN, factory, Type.func(CONN, [[SERVICE_REQUEST]])))
    ).build();

    expect(provider.getService(SERVICE_REQUEST)).toBe(mine);
    expect(provider.getService(CONN)).toBeInstanceOf(Conn);
    expect(seen).toEqual([mine]);
  });

  test('a ServiceRequest slot under a control ask refuses', () => {
    const engine = new Engine([Registration.factory(CONN, (request: unknown) => request, Type.func(CONN, [[SERVICE_REQUEST]]))]);
    const ask = () => engine.getService(new ControlRequest(CONN), () => undefined);

    expect(ask).toThrow(UnsatisfiableError);
    expect(ask).toThrow('not an instance of the asked request class');
  });

  test('a base Request slot answers either arm', () => {
    const seen: Request[] = [];
    const factory = (request: Request) => {
      seen.push(request);
      return new Conn();
    };
    const engine = new Engine([Registration.factory(CONN, factory, Type.func(CONN, [[REQUEST]]))]);
    const controlAsk = new ControlRequest(CONN);
    engine.getService(controlAsk, () => undefined);

    const provider = Builder.withServices(manifest => manifest.add(Registration.factory(CONN, factory, Type.func(CONN, [[REQUEST]])))).build();
    provider.getService(CONN);

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(controlAsk);
    expect(seen[1]).toBeInstanceOf(ServiceRequest);
  });
});

describe('the seeded registrations', () => {
  test('resolving IServiceProvider answers a fresh view forwarding to the asking provider', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.value(CONN, new Conn()))).build();
    const view = provider.getService(PROVIDER) as IServiceProvider;

    expect(view).not.toBe(provider);
    expect(view.getService(CONN)).toBeInstanceOf(Conn);
  });

  test('a user registration at IServiceProvider shadows the seed', () => {
    const mine = { getService: () => 'mine' } as unknown as IServiceProvider;
    const provider = Builder.withServices(manifest => manifest.add(Registration.value(PROVIDER, mine))).build();

    expect(provider.getService(PROVIDER)).toBe(mine);
  });

  test('the two seeded rows are visible through the control registry and carry a null lifetime', () => {
    const engine = new Engine([]);
    const control = engine.getService(new ControlRequest(CONTROL), () => undefined) as ControlService;
    const rows = [...control.registry];

    expect(rows.map(row => row.address)).toEqual([PROVIDER, CONTROL]);
    expect(rows.map(row => 'lifetime' in row ? row.lifetime : undefined)).toEqual([null, null]);
  });
});

describe('shadowing resolves beneath', () => {
  test('a Func<[Foo], Foo> factory receives the shadowed older registration', () => {
    const inner = new Foo();
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.value(FOO, inner))
        .add(Registration.factory(FOO, (foo: Foo) => ({ decorated: foo }), Type.func(FOO, [[FOO]])))
    ).build();

    expect(provider.getService(FOO).decorated).toBe(inner);
  });

  test('stacked decorators each resolve the one beneath', () => {
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.value(FOO, 'base'))
        .add(Registration.factory(FOO, (foo: string) => `[${foo}]`, Type.func(FOO, [[FOO]])))
        .add(Registration.factory(FOO, (foo: string) => `(${foo})`, Type.func(FOO, [[FOO]])))
    ).build();

    expect(provider.getService(FOO)).toBe('([base])');
  });

  test('a self address inside a union slot resolves beneath', () => {
    const inner = new Foo();
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.value(FOO, inner))
        .add(Registration.factory(FOO, (foo: Foo | undefined) => ({ decorated: foo }), Type.func(FOO, [[Type.union(FOO, Type.typeLiteral(undefined))]])))
    ).build();

    expect(provider.getService(FOO).decorated).toBe(inner);
  });

  test('a self address inside a union slot falls through to undefined when nothing older exists', () => {
    const provider = Builder.withServices(manifest =>
      manifest.add(Registration.factory(FOO, (foo: Foo | undefined) => ({ decorated: foo }), Type.func(FOO, [[Type.union(FOO, Type.typeLiteral(undefined))]])))
    ).build();

    expect(provider.getService(FOO).decorated).toBeUndefined();
  });

  test('a self address inside a tuple slot resolves beneath', () => {
    const inner = new Foo();
    const bar = new Bar();
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.value(FOO, inner))
        .add(Registration.value(BAR, bar))
        .add(Registration.factory(FOO, (pair: [Foo, Bar]) => ({ decorated: pair }), Type.func(FOO, [[Type.tuple(FOO, BAR)]])))
    ).build();

    expect(provider.getService(FOO).decorated).toEqual([inner, bar]);
  });

  test('a self-named slot with nothing older throws instead of delegating', () => {
    const provider = Builder.withServices(manifest => manifest.add(Registration.factory(FOO, (foo: unknown) => foo, Type.func(FOO, [[FOO]])))).build();
    const ask = () => provider.getService(FOO);

    expect(ask).toThrow(UnsatisfiableError);
    expect(ask).toThrow('it is registered, but something it needs is not');
  });

  test('a collection ask still enumerates decorator and shadowed both, in authored order', () => {
    const inner = new Foo();
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.value(FOO, inner))
        .add(Registration.factory(FOO, (foo: Foo) => ({ decorated: foo }), Type.func(FOO, [[FOO]])))
    ).build();
    const elements = [...provider.getService(Type.iterable(FOO))];

    expect(elements).toHaveLength(2);
    expect(elements[0]).toBe(inner);
    expect(elements[1].decorated).toBe(inner);
  });

  test('a real cycle through a second address still throws CycleError', () => {
    const provider = Builder.withServices(manifest =>
      manifest
        .add(Registration.factory(FOO, (bar: unknown) => bar, Type.func(FOO, [[BAR]])))
        .add(Registration.factory(BAR, (foo: unknown) => foo, Type.func(BAR, [[FOO]])))
    ).build();

    expect(() => provider.getService(FOO)).toThrow(CycleError);
  });
});
