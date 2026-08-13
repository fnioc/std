// Behaviour tests for descriptor identity. Interned types make `===` the whole of type equality,
// so a registration written as a token and one written through the factories occupy one slot.

import { ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.named('A', 'app');
const B = Type.named('B', 'app');

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
      ServiceDescriptor.ctor(A, Impl, [[Type.from('app:B')]]),
      ServiceDescriptor.ctor(A, Impl, [[B]]),
    )).toBe(true);
  });

  test('separates descriptors whose signatures differ', () => {
    expect(ServiceDescriptor.equals(
      ServiceDescriptor.ctor(A, Impl, [[B]]),
      ServiceDescriptor.ctor(A, Impl, [[A]]),
    )).toBe(false);
  });
});

describe('substitute', () => {
  test('closes an open registration onto the type the factories would have built', () => {
    const open = ServiceDescriptor.ctor(
      Type.named('Box', 'app', [Type.generic('T')]),
      Impl,
      [[Type.generic('T')]],
    );
    const closed = ServiceDescriptor.substitute(open, new Map([['T', A]]));
    expect(closed.serviceType).toBe(Type.named('Box', 'app', [A]));
    expect(closed.kind === 'ctor' && closed.signatures[0]![0]).toBe(A);
  });
});
