// Behaviour tests for descriptor identity. Interned types make `===` the whole of type equality,
// so a registration written as a token and one written through the factories occupy one slot.

import { DefaultManifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');

class Impl {}

// ServiceDescriptor.matches is retired — the service-type identity test it named is inlined at
// each call site instead (e.g. Manifest's own replace/remove verbs), not a public op.
describe.skip('matches', () => {
  test.skip('holds across the spellings of one service type', () => {});
  test.skip('separates a keyed registration from the bare one it tags', () => {});
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
