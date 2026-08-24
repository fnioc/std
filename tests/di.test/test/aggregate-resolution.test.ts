// Behaviour tests for reading an aggregate back through `resolveMany` — the collection of every
// registration for one element type.

import { ServiceProvider } from '@rhombus-std/di';
import { DefaultManifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');

describe('resolveMany', () => {
  test('nothing registered is the empty sequence, not a failure', () => {
    const provider = new ServiceProvider(DefaultManifest.empty<string>());
    expect([...provider.resolveMany(A)]).toEqual([]);
  });

  test('reads the same aggregate the iterable address names', () => {
    const manifest = DefaultManifest.empty<string>()
      .add(ServiceDescriptor.value(A, 'first'))
      .add(ServiceDescriptor.value(A, 'second'));
    const provider = new ServiceProvider(manifest);
    expect([...provider.resolveMany(A)]).toEqual([...provider.resolve(Type.iterable(A))]);
  });
});
