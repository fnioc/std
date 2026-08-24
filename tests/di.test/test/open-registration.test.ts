// Behaviour tests for what an open registration's signature slots mean. A slot that IS the hole
// asks for the type that closed it; a hole standing inside a bigger slot is part of a type
// expression, and the closed expression names a service like any other.

import { ServiceProvider } from '@rhombus-std/di';
import { DefaultManifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { type IServiceProvider, Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const T = Type.generic('T');
const FOO = Type.imported('Foo', 'app');
const BAR = Type.imported('Bar', 'app');
const SERVICE_PROVIDER = Type.imported('IServiceProvider', '@rhombus-std/primitives');

const box = (of: Type) => Type.imported('Box', 'app', [of]);
const holder = (of: Type) => Type.imported('Holder', 'app', [of]);
const crate = (of: Type) => Type.imported('Crate', 'app', [of]);

class Foo {}
class Box {
  constructor(readonly closing: unknown) {}
}
class Holder {
  constructor(readonly of: unknown) {}
}
class Crate {
  constructor(readonly closing: unknown, readonly held: unknown) {}
}
class Resolving {
  constructor(readonly closing: Type, readonly provider: IServiceProvider) {}
}

/** `Box<%T> -> Box`, its lone parameter the bare hole. */
const openBox = DefaultManifest.empty<string>()
  .add(ServiceDescriptor.ctor(box(T), Box, Type.ctor(box(T), [[T]])));

describe('a slot that is the hole', () => {
  test('receives the type that closed the registration', () => {
    const built = new ServiceProvider(openBox).resolve(box(FOO)) as Box;
    expect(built.closing).toBe(FOO);
  });

  test('receives it without anything being registered for that type', () => {
    // Nothing in `openBox` produces a Foo, and the request is still satisfiable: the slot asks
    // for the type, never for a value of it.
    expect(new ServiceProvider(openBox, { validateOnBuild: true }).resolve(box(FOO))).toBeInstanceOf(Box);
  });

  test('receives it even where the closing type IS registered', () => {
    const manifest = openBox.add(ServiceDescriptor.ctor(FOO, Foo, Type.ctor(FOO, [[]])));
    const built = new ServiceProvider(manifest).resolve(box(FOO)) as Box;
    expect(built.closing).toBe(FOO);
    expect(built.closing).not.toBeInstanceOf(Foo);
  });

  test('tracks the request, so two closings deliver two types', () => {
    const provider = new ServiceProvider(openBox);
    expect((provider.resolve(box(FOO)) as Box).closing).toBe(FOO);
    expect((provider.resolve(box(BAR)) as Box).closing).toBe(BAR);
  });

  test('feeds a factory registration the same way', () => {
    const manifest = DefaultManifest.empty<string>()
      .add(ServiceDescriptor.factory(box(T), (closing: unknown) => ({ closing }), Type.func(box(T), [[T]])));
    expect((new ServiceProvider(manifest).resolve(box(FOO)) as Box).closing).toBe(FOO);
  });

  test('is unsatisfiable on a CLOSED registration, where nothing binds it', () => {
    const manifest = DefaultManifest.empty<string>().add(ServiceDescriptor.ctor(FOO, Box, Type.ctor(FOO, [[T]])));
    expect(new ServiceProvider(manifest).resolve(FOO)).toBeUndefined();
  });
});

describe('a hole inside a bigger slot', () => {
  const openCrate = DefaultManifest.empty<string>()
    .add(ServiceDescriptor.ctor(crate(T), Crate, Type.ctor(crate(T), [[T, holder(T)]])))
    .add(ServiceDescriptor.ctor(holder(FOO), Holder, Type.ctor(holder(FOO), [[]])));

  test('closes into a type expression, which resolves as a service', () => {
    const built = new ServiceProvider(openCrate).resolve(crate(FOO)) as Crate;
    expect(built.held).toBeInstanceOf(Holder);
  });

  test('sits beside a bare hole in one signature, each read its own way', () => {
    const built = new ServiceProvider(openCrate).resolve(crate(FOO)) as Crate;
    expect(built.closing).toBe(FOO);
    expect(built.held).toBeInstanceOf(Holder);
  });

  test('leaves the registration unsatisfiable when the closed expression names nothing', () => {
    expect(new ServiceProvider(openCrate).resolve(crate(BAR))).toBeUndefined();
  });
});

describe('reaching an instance of the closing type', () => {
  test('takes the provider beside the delivered type', () => {
    // An instance of the bare closing type has no spelling of its own; a service that wants one
    // asks for the provider too and looks it up with the type it was handed.
    const manifest = DefaultManifest.empty<string>()
      .add(ServiceDescriptor.ctor(box(T), Resolving, Type.ctor(box(T), [[T, SERVICE_PROVIDER]])))
      .add(ServiceDescriptor.ctor(FOO, Foo, Type.ctor(FOO, [[]])));
    const built = new ServiceProvider(manifest).resolve(box(FOO)) as Resolving;
    expect(built.provider.resolve(built.closing)).toBeInstanceOf(Foo);
  });
});

describe('an open registration with no signature at all', () => {
  test('still serves through what its holes capture', () => {
    const echo = Type.func(T, [[T]]);
    const manifest = DefaultManifest.empty<string>()
      .add(ServiceDescriptor.value(echo, (value: unknown) => value));
    const resolved = new ServiceProvider(manifest).resolve(Type.func(FOO, [[FOO]])) as (value: number) => number;
    expect(resolved(42)).toBe(42);
  });
});
