// Behaviour tests for `getRequiredService`. It differs from `getService` only in refusing absence,
// so every value a registration can hold has to come back through it unchanged — including the
// falsy ones a truthiness guard would mistake for nothing being registered.

import { ServiceProvider } from '@rhombus-std/di';
import { DefaultManifest } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.imported('A', 'app');
const Missing = Type.imported('Missing', 'app');

function providerFor(value: unknown): ServiceProvider {
  return new ServiceProvider(DefaultManifest.empty<string>().add(A, value));
}

describe('a falsy registration is an answer, not an absence', () => {
  test.each([
    ['zero', 0],
    ['false', false],
    ['the empty string', ''],
    ['NaN', Number.NaN],
    ['zero as a bigint', 0n],
    ['null', null],
  ])('%s resolves through getRequiredService', (_label, value) => {
    const provider = providerFor(value);
    expect(provider.getRequiredService(A)).toBe(value);
    expect(provider.getService(A)).toBe(value);
  });
});

describe('absence', () => {
  test('nothing registered throws, naming the service type', () => {
    const provider = new ServiceProvider(DefaultManifest.empty<string>());
    expect(() => provider.getRequiredService(Missing)).toThrow('nothing is registered for app:Missing.');
  });

  test('getService answers a miss with undefined, which is what makes it the discriminator', () => {
    const provider = new ServiceProvider(DefaultManifest.empty<string>());
    expect(provider.getService(Missing)).toBeUndefined();
  });

  // `undefined` is the answer getService gives for a miss, so a registration holding it is
  // indistinguishable from having registered nothing at all. Registering `undefined` to mean
  // "present but empty" is not available; register `null` for that.
  test('a registration holding undefined reads as absent', () => {
    expect(() => providerFor(undefined).getRequiredService(A)).toThrow('nothing is registered for app:A.');
  });
});
