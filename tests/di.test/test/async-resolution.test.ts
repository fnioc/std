// Behaviour tests for the async resolution boundary: `resolveAsync` gathering a boundary's
// promise-only dependencies together rather than one after another, a plain `resolve` never
// awaiting a promise address on the caller's behalf, and the `AsyncIterable<T>` collection form.

import { Builder } from '@rhombus-std/di';
import { Manifest, Registration, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

/** Seals `manifest` into a provider with no lifetime model: every ask constructs afresh. */
function toProvider(manifest: Manifest<unknown>) {
  return Builder.withServices(() => manifest).build();
}

const CLOCK = Type.imported('Clock', 'app');
const CONFIG = Type.imported('Config', 'app');
const PAIR = Type.imported('Pair', 'app');
const ITEM = Type.imported('Item', 'app');

class Clock {}
class Config {}

/** Depends on two promise-only registrations, so the boundary above it has two entries to settle. */
class Pair {
  constructor(readonly clock: Clock, readonly config: Config) {}
}

/** A collection element carrying which registration produced it. */
class Item {
  constructor(readonly id: number) {}
}

describe('resolveAsync gathers one boundary at a time', () => {
  test('settles two independent promise-only dependencies under one await', async () => {
    const manifest = Manifest.empty<unknown>()
      .addValue(Type.promise(CLOCK), Promise.resolve(new Clock()))
      .addValue(Type.promise(CONFIG), Promise.resolve(new Config()))
      .add(Registration.ctor(PAIR, Pair, Type.ctor(PAIR, [[CLOCK, CONFIG]])));

    const pair = await toProvider(manifest).resolveAsync(PAIR) as Pair;
    expect(pair.clock).toBeInstanceOf(Clock);
    expect(pair.config).toBeInstanceOf(Config);
  });

  test('one failing dependency surfaces as an AggregateError naming the boundary', async () => {
    const manifest = Manifest.empty<unknown>()
      .addValue(Type.promise(CLOCK), Promise.reject(new Error('clock offline')))
      .addValue(Type.promise(CONFIG), Promise.resolve(new Config()))
      .add(Registration.ctor(PAIR, Pair, Type.ctor(PAIR, [[CLOCK, CONFIG]])));

    let caught: unknown;
    try {
      await toProvider(manifest).resolveAsync(PAIR);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    const aggregate = caught as AggregateError;
    expect(aggregate.errors).toHaveLength(1);
    expect(aggregate.message).toContain('Pair');
    expect(aggregate.message).toContain('1 of the dependencies it awaits failed');
  });

  test('two failing dependencies both surface, as distinct reasons on the same AggregateError', async () => {
    const manifest = Manifest.empty<unknown>()
      .addValue(Type.promise(CLOCK), Promise.reject(new Error('clock offline')))
      .addValue(Type.promise(CONFIG), Promise.reject(new Error('config offline')))
      .add(Registration.ctor(PAIR, Pair, Type.ctor(PAIR, [[CLOCK, CONFIG]])));

    let caught: unknown;
    try {
      await toProvider(manifest).resolveAsync(PAIR);
    } catch (error) {
      caught = error;
    }

    const aggregate = caught as AggregateError;
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.message).toContain('2 of the dependencies it awaits failed');
  });
});

describe('an await with nothing to enclose it', () => {
  /** A synchronous dependent of the settled Clock, which only Promise<Clock> produces. */
  class SyncConsumer {
    constructor(readonly clock: Clock) {}
  }

  test('a synchronous dependency on a value only its promised form produces is unsatisfiable', () => {
    const manifest = Manifest.empty<unknown>()
      .addValue(Type.promise(CLOCK), Promise.resolve(new Clock()))
      .add(Registration.ctor(PAIR, SyncConsumer, Type.ctor(PAIR, [[CLOCK]])));
    const provider = toProvider(manifest);

    expect(() => provider.resolve(PAIR)).toThrow(UnsatisfiableError);
    expect(() => provider.resolve(PAIR)).toThrow('nothing encloses an await to hoist it');
  });
});

describe('an await nested inside another', () => {
  const HOLDER = Type.imported('Holder', 'app');
  const DEEP = Type.imported('Deep', 'app');

  class Deep {}
  /** Wants the settled Holder, itself produced by awaiting a factory that wants the settled Deep. */
  class Nested {
    constructor(readonly holder: unknown) {}
  }

  test('the inner await settles before the outer one it hoists onto', async () => {
    const manifest = Manifest.empty<unknown>()
      .addValue(Type.promise(DEEP), Promise.resolve(new Deep()))
      .add(Registration.factory(Type.promise(HOLDER), (deep: unknown) => Promise.resolve(deep), Type.func(Type.promise(HOLDER), [[DEEP]])))
      .add(Registration.ctor(PAIR, Nested, Type.ctor(PAIR, [[HOLDER]])));

    const nested = await toProvider(manifest).resolveAsync(PAIR) as Nested;
    expect(nested.holder).toBeInstanceOf(Deep);
  });
});

describe('a bare resolve of a promise address never awaits it', () => {
  test('answers the promise itself; only resolveAsync unwraps what it settles to', async () => {
    const manifest = Manifest.empty<unknown>().addValue(Type.promise(CLOCK), Promise.resolve(new Clock()));
    const provider = toProvider(manifest);

    const pending = provider.resolve(Type.promise(CLOCK));
    expect(pending).toBeInstanceOf(Promise);

    const clock = await provider.resolveAsync(CLOCK);
    expect(clock).toBeInstanceOf(Clock);
  });
});

describe('AsyncIterable<T> collections', () => {
  /** Seals `manifest` and resolves the `AsyncIterable<Item>` address as its own typed value. */
  function resolveItems(manifest: Manifest<unknown>): AsyncIterable<Item> {
    return toProvider(manifest).resolve(Type.global('AsyncIterable', [ITEM])) as AsyncIterable<Item>;
  }

  test('yields every registration in registration order', async () => {
    const manifest = Manifest.empty<unknown>()
      .add(Registration.factory(ITEM, () => new Item(1), Type.func(ITEM, [[]])))
      .add(Registration.factory(ITEM, () => new Item(2), Type.func(ITEM, [[]])));

    const seen: number[] = [];
    for await (const item of resolveItems(manifest)) {
      seen.push(item.id);
    }
    expect(seen).toEqual([1, 2]);
  });

  test('realizes each element lazily, only as the step reaching it runs', async () => {
    const made: number[] = [];
    const manifest = Manifest.empty<unknown>()
      .add(Registration.factory(ITEM, () => {
        made.push(1);
        return new Item(1);
      }, Type.func(ITEM, [[]])))
      .add(Registration.factory(ITEM, () => {
        made.push(2);
        return new Item(2);
      }, Type.func(ITEM, [[]])));

    const iterator = resolveItems(manifest)[Symbol.asyncIterator]();
    expect(made).toEqual([]);

    await iterator.next();
    expect(made).toEqual([1]);

    await iterator.next();
    expect(made).toEqual([1, 2]);
  });
});
