// Behaviour tests for descriptor identity. Interned types make `===` the whole of type equality,
// so a registration written as a token and one written through the factories occupy one slot.

import { DefaultManifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');

class Impl {}

describe('matches', () => {
  test('holds across the spellings of one service type', () => {
    expect(ServiceDescriptor.matches(
      ServiceDescriptor.value(Type.from('app:A'), 1),
      ServiceDescriptor.value(A, 2),
    )).toBe(true);
  });

  test('separates a keyed registration from the bare one it tags', () => {
    expect(ServiceDescriptor.matches(
      ServiceDescriptor.value(A, 1),
      ServiceDescriptor.value(Type.tag(A, 'primary'), 2),
    )).toBe(false);
  });
});

describe('equals', () => {
  test('holds when the signatures agree however they were spelled', () => {
    expect(ServiceDescriptor.equals(
      ServiceDescriptor.ctor(A, Impl, Type.ctor(A, [[Type.from('app:B')]])),
      ServiceDescriptor.ctor(A, Impl, Type.ctor(A, [[B]])),
    )).toBe(true);
  });

  test('separates descriptors whose signatures differ', () => {
    expect(ServiceDescriptor.equals(
      ServiceDescriptor.ctor(A, Impl, Type.ctor(A, [[B]])),
      ServiceDescriptor.ctor(A, Impl, Type.ctor(A, [[A]])),
    )).toBe(false);
  });
});

describe('substitute', () => {
  test('closes an open registration onto the type the factories would have built', () => {
    const openBox = Type.imported('Box', 'app', [Type.generic('T')]);
    const open = ServiceDescriptor.ctor(openBox, Impl, Type.ctor(openBox, [[Type.generic('T')]]));
    const closed = ServiceDescriptor.substitute(open, new Map([['T', A]]));
    expect(closed.serviceType).toBe(Type.imported('Box', 'app', [A]));
    expect('ctor' in closed && closed.ctorType.args[0]![0]).toBe(A);
  });
});

describe('ctor', () => {
  test('refuses an abstract implementer type — nothing can `new` it directly', () => {
    expect(() => ServiceDescriptor.ctor(A, Impl, Type.ctor(A, [[]], true)))
      .toThrow(/is abstract — nothing can `new` it directly/);
  });

  test('a literal-built descriptor meets the same refusal where it enters a manifest', () => {
    const literal = { serviceType: A, ctor: Impl, ctorType: Type.ctor(A, [[]], true) };
    expect(() => DefaultManifest.empty<string>().add(literal))
      .toThrow(/is abstract — nothing can `new` it directly/);
  });
});

describe('value', () => {
  const T = Type.generic('T');

  test('refuses an open service type — one instance cannot stand for every closing', () => {
    expect(() => ServiceDescriptor.value(Type.imported('Box', 'app', [T]), {}))
      .toThrow(/still holds a generic hole/);
    expect(() => ServiceDescriptor.value(Type.array(T), []))
      .toThrow(/still holds a generic hole/);
  });

  test('accepts a hole under a callable root — one erased callable is every closing', () => {
    const open = Type.func(Type.imported('Box', 'app', [T]), [[]]);
    expect(ServiceDescriptor.value(open, () => ({})).serviceType).toBe(open);
    const openCtor = Type.ctor(Type.imported('Box', 'app', [T]), [[]]);
    expect(ServiceDescriptor.value(openCtor, Impl).serviceType).toBe(openCtor);
  });

  test('a tag over the callable does not change the answer', () => {
    const tagged = Type.tag(Type.func(Type.imported('Box', 'app', [T]), [[]]), 'primary');
    expect(ServiceDescriptor.value(tagged, () => ({})).serviceType).toBe(tagged);
    expect(() => ServiceDescriptor.value(Type.tag(Type.imported('Box', 'app', [T]), 'primary'), {}))
      .toThrow(/still holds a generic hole/);
  });

  test('a closed service type is untouched by the guard', () => {
    expect(ServiceDescriptor.value(A, 'plain').value).toBe('plain');
  });
});
