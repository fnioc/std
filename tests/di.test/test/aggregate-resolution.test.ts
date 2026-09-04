// Behaviour tests for reading an aggregate back through `resolveIterable` — the collection of every
// registration for one element type.

import { Builder } from '@rhombus-std/di';
import { Manifest, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

/** Seals `manifest` into a provider with no lifetime model: every ask constructs afresh. */
function toProvider(manifest: Manifest<string>) {
  return Builder.withServices(() => manifest).build();
}

const A = Type.imported('A', 'app');

describe('resolveIterable', () => {
  test('nothing registered is the empty sequence, not a failure', () => {
    const provider = toProvider(Manifest.empty<string>());
    expect([...provider.resolveIterable(A)]).toEqual([]);
  });

  test('reads the same aggregate the iterable address names', () => {
    const manifest = Manifest.empty<string>()
      .add(Registration.value(A, 'first'))
      .add(Registration.value(A, 'second'));
    const provider = toProvider(manifest);
    expect([...provider.resolveIterable(A)]).toEqual([...provider.resolve(Type.iterable(A))]);
  });
});
