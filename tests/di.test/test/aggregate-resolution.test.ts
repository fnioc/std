// Behaviour tests for reading an aggregate back through `resolveMany` — the collection of every
// registration for one element type.

import { di, noop } from '@rhombus-std/di';
import { Manifest, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

/** Seals `manifest` into a provider through the front door, on the noop lifetime model. */
function toProvider(manifest: Manifest<string>) {
  return di.usingLifetimeModel(noop()).configureServices(m => m.add(manifest)).build();
}

const A = Type.imported('A', 'app');

describe('resolveMany', () => {
  test('nothing registered is the empty sequence, not a failure', () => {
    const provider = toProvider(Manifest.empty<string>());
    expect([...provider.resolveMany(A)]).toEqual([]);
  });

  test('reads the same aggregate the iterable address names', () => {
    const manifest = Manifest.empty<string>()
      .add(Registration.value(A, 'first'))
      .add(Registration.value(A, 'second'));
    const provider = toProvider(manifest);
    expect([...provider.resolveMany(A)]).toEqual([...provider.resolve(Type.iterable(A))]);
  });
});
