// Behaviour tests for how a value registration meets validateScopes over the standard lifetime
// model: a value names no lifetime and has no dependencies to plan, so it is never a captive, and
// standing beside a real captive it never hides one.

import { Builder, ScopeValidationError, standardLifetime, validateBuildability, validateScopes } from '@rhombus-std/di';
import { ManifestValidationError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const LABEL = Type.imported('Label', 'app');
const COUNTER = Type.imported('Counter', 'app');
const HOLDER = Type.imported('Holder', 'app');

class Counter {}

class Holder {
  constructor(readonly label: unknown, readonly counter: unknown) {}
}

describe('a value registration under the captive check', () => {
  test('a singleton consuming a value builds and resolves: a value is no captive', () => {
    const provider = Builder.useAddon(validateBuildability()).useAddon(validateScopes()).useAddon(standardLifetime())
      .withServices(m =>
        m
          .addValue(LABEL, 'checkout')
          .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'singleton')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[LABEL, COUNTER]]), 'singleton')
      )
      .build();

    const holder = provider.resolve(HOLDER) as Holder;
    expect(holder.label).toBe('checkout');
    expect(holder.counter).toBeInstanceOf(Counter);
  });

  test('a value beside a scoped dependency of a singleton does not hide the captive', () => {
    let caught: unknown;
    try {
      Builder.useAddon(validateBuildability()).useAddon(validateScopes()).useAddon(standardLifetime())
        .withServices(m =>
          m
            .addValue(LABEL, 'checkout')
            .add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), 'scoped')
            .add(HOLDER, Holder, Type.ctor(HOLDER, [[LABEL, COUNTER]]), 'singleton')
        )
        .build();
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ManifestValidationError);
    const failures = (caught as ManifestValidationError).failures;
    expect(failures.map(failure => failure.address)).toEqual([HOLDER]);
    expect(failures[0]!.error).toBeInstanceOf(ScopeValidationError);
    expect((failures[0]!.error as ScopeValidationError).address).toBe(COUNTER);
  });
});
