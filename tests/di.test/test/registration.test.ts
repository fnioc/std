// Behaviour tests for registration identity. Interned types make `===` the whole of type equality,
// so a registration written as a token and one written through the factories occupy one slot.

import { Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');

class Impl {}

describe('equals', () => {
  test('holds when the signatures agree however they were spelled', () => {
    expect(Registration.equals(
      Registration.ctor(A, Impl, Type.ctor(A, [[Type.from('app:B')]])),
      Registration.ctor(A, Impl, Type.ctor(A, [[B]])),
    )).toBe(true);
  });

  test('separates registrations whose signatures differ', () => {
    expect(Registration.equals(
      Registration.ctor(A, Impl, Type.ctor(A, [[B]])),
      Registration.ctor(A, Impl, Type.ctor(A, [[A]])),
    )).toBe(false);
  });
});

describe('value', () => {
  const T = Type.generic('T');

  test('refuses an open service type — one instance cannot stand for every closing', () => {
    expect(() => Registration.value(Type.imported('Box', 'app', [T]), {}))
      .toThrow(/still holds a generic hole/);
    expect(() => Registration.value(Type.array(T), []))
      .toThrow(/still holds a generic hole/);
  });

  test('accepts a hole under a callable root — one erased callable is every closing', () => {
    const open = Type.func(Type.imported('Box', 'app', [T]), [[]]);
    expect(Registration.value(open, () => ({})).address).toBe(open);
    const openCtor = Type.ctor(Type.imported('Box', 'app', [T]), [[]]);
    expect(Registration.value(openCtor, Impl).address).toBe(openCtor);
  });

  test('a tag over the callable does not change the answer', () => {
    const tagged = Type.tag(Type.func(Type.imported('Box', 'app', [T]), [[]]), 'primary');
    expect(Registration.value(tagged, () => ({})).address).toBe(tagged);
    expect(() => Registration.value(Type.tag(Type.imported('Box', 'app', [T]), 'primary'), {}))
      .toThrow(/still holds a generic hole/);
  });

  test('a closed service type is untouched by the guard', () => {
    expect(Registration.value(A, 'plain').value).toBe('plain');
  });
});
