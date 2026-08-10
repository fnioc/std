// Behaviour tests for collection requests. `T[]` and `Iterable<T>` gather the same members and
// differ only in how they hand them over -- eagerly, or lazily and re-iterably.

import { ServiceProvider } from '@rhombus-std/di2';
import { DefaultManifest, ServiceDescriptor } from '@rhombus-std/di2.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const HANDLER = Type.named('Handler', 'app');
const MISSING = Type.named('Missing', 'app');
const arrayOf = (element: Type) => Type.named('Array', 'global', [element]);
const iterableOf = (element: Type) => Type.named('Iterable', 'global', [element]);

class First {}
class Second {}
class Third {}

/** Three handlers, registered first to last. */
function threeHandlers() {
  return DefaultManifest.empty<string>()
    .add(ServiceDescriptor.ctor(HANDLER, First, [[]]))
    .add(ServiceDescriptor.ctor(HANDLER, Second, [[]]))
    .add(ServiceDescriptor.ctor(HANDLER, Third, [[]]));
}

function resolveArray(element: Type): unknown[] {
  return new ServiceProvider(threeHandlers()).resolve(arrayOf(element)) as unknown[];
}

describe('Array<T>', () => {
  test('gathers every registration', () => {
    expect(resolveArray(HANDLER)).toHaveLength(3);
  });

  test('is a real array, not an iterator', () => {
    expect(Array.isArray(resolveArray(HANDLER))).toBe(true);
  });

  test('yields registration order, oldest first', () => {
    expect(resolveArray(HANDLER).map(handler => handler!.constructor)).toEqual([First, Second, Third]);
  });

  test('ends with the member a singular request resolves to', () => {
    const provider = new ServiceProvider(threeHandlers());
    const all = provider.resolve(arrayOf(HANDLER)) as unknown[];
    expect(all.at(-1)!.constructor).toBe(provider.resolve(HANDLER).constructor);
  });

  test('an unregistered element is an empty collection, not a failure', () => {
    expect(resolveArray(MISSING)).toEqual([]);
  });

  test('T[] and Array<T> are one request', () => {
    // Both spellings derive the same type, so the engine never sees two.
    expect(Type.from('Array<app:Handler>')).toBe(arrayOf(HANDLER));
  });
});

describe('Iterable<T>', () => {
  test('gathers the same members in the same order', () => {
    const handlers = new ServiceProvider(threeHandlers()).resolve(iterableOf(HANDLER)) as Iterable<unknown>;
    expect([...handlers].map(handler => handler!.constructor)).toEqual([First, Second, Third]);
  });

  test('re-iterates rather than emptying after one walk', () => {
    const handlers = new ServiceProvider(threeHandlers()).resolve(iterableOf(HANDLER)) as Iterable<unknown>;
    expect([...handlers]).toHaveLength(3);
    expect([...handlers]).toHaveLength(3);
  });

  test('each walk realizes afresh, so transient members are new instances', () => {
    const handlers = new ServiceProvider(threeHandlers()).resolve(iterableOf(HANDLER)) as Iterable<unknown>;
    expect([...handlers][0]).not.toBe([...handlers][0]);
  });

  test('an unregistered element is an empty sequence', () => {
    const handlers = new ServiceProvider(threeHandlers()).resolve(iterableOf(MISSING)) as Iterable<unknown>;
    expect([...handlers]).toEqual([]);
  });
});

describe('a registration for the collection itself', () => {
  test('answers outright instead of being aggregated', () => {
    const whole = [new First()];
    const provider = new ServiceProvider(threeHandlers().add(ServiceDescriptor.value(arrayOf(HANDLER), whole)));
    expect(provider.resolve(arrayOf(HANDLER))).toBe(whole);
  });
});
