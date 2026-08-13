// Behaviour tests for resolving `AsyncIterable<T>` — the aggregate that hands back every
// registration for its element over the async iteration protocol, one element resolved per
// step rather than all at once.

import { ServiceProvider } from '@rhombus-std/di';
import { DefaultManifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const A = Type.import('A', 'app');

describe('async iterable resolution', () => {
  test('nothing registered is an empty async iterable', async () => {
    const provider = new ServiceProvider(DefaultManifest.empty<string>());
    const gathered: unknown[] = [];
    for await (const item of provider.getService(Type.asyncIterable(A))) {
      gathered.push(item);
    }
    expect(gathered).toEqual([]);
  });

  test('every registration for the element appears, in registration order', async () => {
    const manifest = DefaultManifest.empty<string>()
      .add(ServiceDescriptor.value(A, 'first'))
      .add(ServiceDescriptor.value(A, 'second'))
      .add(ServiceDescriptor.value(A, 'third'));
    const provider = new ServiceProvider(manifest);
    const gathered: unknown[] = [];
    for await (const item of provider.getService(Type.asyncIterable(A))) {
      gathered.push(item);
    }
    expect(gathered).toEqual(['first', 'second', 'third']);
  });

  test("a registration's factory runs only when its element is iterated", async () => {
    const ran: string[] = [];
    const manifest = DefaultManifest.empty<string>()
      .add(ServiceDescriptor.factory(A, () => {
        ran.push('one');
        return 'one';
      }, [[]]))
      .add(ServiceDescriptor.factory(A, () => {
        ran.push('two');
        return 'two';
      }, [[]]));
    const provider = new ServiceProvider(manifest);

    const asyncIterable = provider.getService(Type.asyncIterable(A));
    expect(ran).toEqual([]);

    const iterator = asyncIterable[Symbol.asyncIterator]();
    const first = await iterator.next();
    expect(first).toEqual({ value: 'one', done: false });
    expect(ran).toEqual(['one']);

    const second = await iterator.next();
    expect(second).toEqual({ value: 'two', done: false });
    expect(ran).toEqual(['one', 'two']);

    const done = await iterator.next();
    expect(done.done).toBe(true);
  });

  test('a registration made directly under the address answers as itself, never synthesized', () => {
    const manifest = DefaultManifest.empty<string>()
      .add(ServiceDescriptor.value(A, 'a-val'))
      .add(ServiceDescriptor.value(Type.asyncIterable(A), 'exact-async-iter'));
    const provider = new ServiceProvider(manifest);
    expect(provider.getService(Type.asyncIterable(A))).toBe('exact-async-iter');
  });
});

describe('getServices', () => {
  test('nothing registered is the empty sequence, not a failure', () => {
    const provider = new ServiceProvider(DefaultManifest.empty<string>());
    expect([...provider.getServices(A)]).toEqual([]);
  });

  test('reads the same aggregate the iterable address names', () => {
    const manifest = DefaultManifest.empty<string>()
      .add(ServiceDescriptor.value(A, 'first'))
      .add(ServiceDescriptor.value(A, 'second'));
    const provider = new ServiceProvider(manifest);
    expect([...provider.getServices(A)]).toEqual([...provider.getService(Type.iterable(A))]);
  });
});
