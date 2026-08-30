// Behaviour tests proving the standard model's captivity sweep leaves a value registration's
// product alone: it has no lifetime to capture, so it never becomes a captor or a captive.

import { di, standard } from '@rhombus-std/di';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const LABEL = Type.imported('Label', 'app');
const COUNTER = Type.imported('Counter', 'app');
const HOLDER = Type.imported('Holder', 'app');

class Counter {}

class Holder {
  constructor(readonly label: unknown, readonly counter: unknown) {}
}

describe('captivity sweep and value registrations', () => {
  test('a singleton depending on a plain value builds without a captivity error', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest
          .addValue(LABEL, 'checkout')
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[LABEL, COUNTER]]), 'singleton')
      )
      .build();

    const holder = provider.resolve(HOLDER) as Holder;
    expect(holder.label).toBe('checkout');
    expect(holder.counter).toBeInstanceOf(Counter);
  });

  test('a value dependency sitting beside a real captive pair does not mask it', () => {
    expect(() =>
      di.usingLifetimeModel(standard())
        .configureServices(manifest =>
          manifest
            .addValue(LABEL, 'checkout')
            .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
            .add(HOLDER, Holder, Type.ctor(HOLDER, [[LABEL, COUNTER]]), 'singleton')
        )
        .build()
    ).toThrow();
  });
});
