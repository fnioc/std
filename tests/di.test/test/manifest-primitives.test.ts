// `add`, `remove` and `replace` are the chain primitives, and `add` shares its name with the
// sugared registration shapes augmentation mounts on top of it. These tests hold both halves of
// that name to the same instance: a descriptor reaches the primitive, and a service type paired
// with an implementer reaches the sugar.

import { ConstantType, DefaultManifest, type Manifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');

class Impl {}

/** A fresh instance, read through the interface every caller holds. */
function blank(): Manifest<string> {
  return new DefaultManifest<string>();
}

/** The registered values, newest first — the order iterating a manifest yields. */
function values(manifest: Manifest<string>): unknown[] {
  return [...manifest].map(descriptor => 'value' in descriptor ? descriptor.value : ServiceDescriptor.kind(descriptor)[0]);
}

describe('add answers to both the primitive and the sugared shapes', () => {
  test('a lone descriptor reaches the primitive', () => {
    expect(values(blank().add(ServiceDescriptor.value(A, 'a')))).toEqual(['a']);
  });

  test('a service type paired with a constructor reaches the sugar', () => {
    const manifest = blank().add(A, Impl, Type.ctor(A, [[]]), 'singleton');
    expect([...manifest]).toEqual([ServiceDescriptor.ctor(A, Impl, Type.ctor(A, [[]]), 'singleton')]);
  });

  test('a service type paired with a factory reaches the sugar', () => {
    const manifest = blank().add(A, () => 'a', Type.func(A, [[]]), 'singleton');
    expect(values(manifest)).toEqual(['factory']);
  });

  test('a service type paired with the constant marker reaches the value door', () => {
    expect(values(blank().add(A, 'a', ConstantType))).toEqual(['a']);
  });

  test('the two shapes chain into one manifest, newest first', () => {
    const manifest = blank()
      .add(ServiceDescriptor.value(A, 'a'))
      .add(B, () => 'b', Type.func(B, [[]]), 'singleton');
    expect(values(manifest)).toEqual(['factory', 'a']);
  });
});

describe('remove and replace are reachable on the instance', () => {
  test('remove drops the descriptor it equals', () => {
    const descriptor = ServiceDescriptor.value(A, 'a');
    const manifest = blank().add(descriptor).add(ServiceDescriptor.value(B, 'b'));
    expect(values(manifest.remove(descriptor))).toEqual(['b']);
  });

  test('replace swaps the descriptor holding the slot, in the slot it holds', () => {
    const manifest = blank()
      .add(ServiceDescriptor.value(A, 'first'))
      .add(ServiceDescriptor.value(B, 'b'));
    expect(values(manifest.replace(ServiceDescriptor.value(A, 'second')))).toEqual(['b', 'second']);
  });
});
