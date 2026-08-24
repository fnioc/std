// Behaviour tests for how `getService` answers — or refuses — a request nothing satisfies, and
// for the union spelling a caller reaches for when absence is an answer rather than a fault.

import { di } from '@rhombus-std/di';
import { type IServiceProvider, LifetimeModel, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const Missing = Type.imported('Missing', 'app');
/** What `typefor<undefined>()` derives — the literal that orders last in a union. */
const UNDEFINED = Type.typeLiteral(undefined);

function emptyProvider(): IServiceProvider {
  return di.usingLifetimeModel(LifetimeModel.noop).build();
}

function providerFor(value: unknown): IServiceProvider {
  return di.usingLifetimeModel(LifetimeModel.noop)
    .configureServices(manifest => manifest.addValue(A, value))
    .build();
}

describe('a falsy registration is an answer, not an absence', () => {
  test.each([
    ['zero', 0],
    ['false', false],
    ['the empty string', ''],
    ['NaN', Number.NaN],
    ['zero as a bigint', 0n],
    ['null', null],
    ['undefined', undefined],
  ])('%s comes back untouched', (_label, value) => {
    const provider = providerFor(value);
    expect(provider.getService(A)).toBe(value);
    expect(provider.resolve(A)).toBe(value);
  });
});

describe('absence', () => {
  test('nothing registered throws, naming the service type', () => {
    const provider = emptyProvider();
    expect(() => provider.getService(Missing)).toThrow(UnsatisfiableError);
    expect(() => provider.getService(Missing)).toThrow('app:Missing');
  });

  test('a union with undefined answers undefined instead, which is the optional ask', () => {
    expect(emptyProvider().getService(Type.union(Missing, UNDEFINED))).toBeUndefined();
  });

  test('the undefined member serves only once the service type has no way to build', () => {
    expect(providerFor('a').getService(Type.union(A, UNDEFINED))).toBe('a');
  });

  test('resolve refuses a miss the same way — one value, one path', () => {
    expect(() => emptyProvider().resolve(Missing)).toThrow(UnsatisfiableError);
  });
});
