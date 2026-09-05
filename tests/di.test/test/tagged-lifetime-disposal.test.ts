// Behaviour tests for disposal under the tagged lifetime model: which scope captures an instance
// and what is never captured, the order and deduplication of the walk, how errors aggregate, the
// two forms against the two protocols, and what every provider refuses once a scope on its chain
// or the built provider has ended.

import { Builder, taggedLifetime } from '@rhombus-std/di';
import { type IDisposableServiceProvider, type IServiceProvider, type ITaggedServiceScopeFactory, ObjectDisposedError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

type Lifetime = 'session' | 'request' | undefined;
type Tag = Exclude<Lifetime, undefined>;

const SCOPE_FACTORY = Type.imported('ITaggedServiceScopeFactory', '@rhombus-std/di.core', [
  Type.union(Type.typeLiteral('session'), Type.typeLiteral('request'), Type.typeLiteral(undefined)),
]);
const RECORDER = Type.imported('Recorder', 'app');
const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const C = Type.imported('C', 'app');
const HOLDER = Type.imported('Holder', 'app');

/** Logs its disposal, by id, into a shared order. */
class Recorder {
  disposed = 0;
  constructor(readonly id = 'recorder', readonly order: string[] = []) {}
  [Symbol.dispose](): void {
    this.disposed++;
    this.order.push(this.id);
  }
}

class AsyncRecorder {
  disposed = 0;
  constructor(readonly id = 'async', readonly order: string[] = []) {}
  async [Symbol.asyncDispose](): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
    this.disposed++;
    this.order.push(this.id);
  }
}

class DualRecorder {
  sync = 0;
  async = 0;
  [Symbol.dispose](): void {
    this.sync++;
  }
  async [Symbol.asyncDispose](): Promise<void> {
    this.async++;
  }
}

class Holder {
  constructor(readonly recorder: Recorder) {}
}

class Throwing {
  constructor(readonly order: string[], readonly id: string) {}
  [Symbol.dispose](): void {
    this.order.push(this.id);
    throw new Error(`${this.id} failed`);
  }
}

function openScope(provider: IServiceProvider, tag: Tag): IDisposableServiceProvider {
  return (provider.resolve(SCOPE_FACTORY) as ITaggedServiceScopeFactory<Lifetime>).openScope(tag);
}

/** A container over a factory-made {@link Recorder} alone, under `lifetime`. */
function recorderProvider(lifetime?: Lifetime, order: string[] = []): IDisposableServiceProvider {
  return Builder.useAddon(taggedLifetime<Lifetime>())
    .withServices(m => m.add(RECORDER, () => new Recorder('recorder', order), Type.func(RECORDER, [[]]), lifetime))
    .build();
}

/** A container over three factory-made recorders, every one tagged `'session'`, logging into `order`. */
function threeProvider(order: string[], b: () => unknown = () => new Recorder('b', order)): IDisposableServiceProvider {
  return Builder.useAddon(taggedLifetime<Lifetime>())
    .withServices(m =>
      m
        .add(A, () => new Recorder('a', order), Type.func(A, [[]]), 'session')
        .add(B, b, Type.func(B, [[]]), 'session')
        .add(C, () => new Recorder('c', order), Type.func(C, [[]]), 'session')
    )
    .build();
}

describe('what is captured', () => {
  test('an instance a scope caches is disposed with that scope, and only then', () => {
    const provider = recorderProvider('session');
    const session = openScope(provider, 'session');
    const instance = session.resolve(RECORDER) as Recorder;
    const other = openScope(provider, 'session').resolve(RECORDER) as Recorder;

    session[Symbol.dispose]();
    expect(instance.disposed).toBe(1);
    expect(other.disposed).toBe(0);
  });

  test('a constructed instance is disposed like a factory-made one', () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m => m.add(RECORDER, Recorder, Type.ctor(RECORDER, [[]]), 'session'))
      .build();
    const session = openScope(provider, 'session');
    const instance = session.resolve(RECORDER) as Recorder;

    session[Symbol.dispose]();
    expect(instance.disposed).toBe(1);
  });

  test('an instance cached up the chain is disposed with the scope that cached it, not the one asked', () => {
    const provider = recorderProvider('session');
    const session = openScope(provider, 'session');
    const request = openScope(session, 'request');
    const instance = request.resolve(RECORDER) as Recorder;

    request[Symbol.dispose]();
    expect(instance.disposed).toBe(0);
    session[Symbol.dispose]();
    expect(instance.disposed).toBe(1);
  });

  test('an instance handed to a value registration is never disposed', () => {
    const instance = new Recorder();
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m => m.addValue(RECORDER, instance))
      .build();
    const session = openScope(provider, 'session');
    session.resolve(RECORDER);
    provider.resolve(RECORDER);

    session[Symbol.dispose]();
    provider[Symbol.dispose]();
    expect(instance.disposed).toBe(0);
  });

  test('an instance offering neither protocol is simply not tracked', () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m => m.add(A, () => ({}), Type.func(A, [[]]), 'session'))
      .build();
    const session = openScope(provider, 'session');
    session.resolve(A);
    expect(() => session[Symbol.dispose]()).not.toThrow();
  });
});

describe('what is never captured', () => {
  test('a transient resolved from the built provider is not disposed with it', () => {
    const provider = recorderProvider();
    const instance = provider.resolve(RECORDER) as Recorder;
    provider[Symbol.dispose]();
    expect(instance.disposed).toBe(0);
  });

  test('a transient resolved from a scope is not disposed with it', () => {
    const provider = recorderProvider();
    const session = openScope(provider, 'session');
    const instance = session.resolve(RECORDER) as Recorder;
    session[Symbol.dispose]();
    expect(instance.disposed).toBe(0);
  });

  test('a transient injected into a cached node is not disposed with the scope caching the node', () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(RECORDER, Recorder, Type.ctor(RECORDER, [[]]))
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[RECORDER]]), 'session')
      )
      .build();
    const session = openScope(provider, 'session');
    const holder = session.resolve(HOLDER) as Holder;

    session[Symbol.dispose]();
    expect(holder.recorder.disposed).toBe(0);
  });

  test('a tagged instance reached where no scope carries its tag is not disposed by anyone', () => {
    const provider = recorderProvider('request');
    const session = openScope(provider, 'session');
    const fromSession = session.resolve(RECORDER) as Recorder;
    const fromBuilt = provider.resolve(RECORDER) as Recorder;

    session[Symbol.dispose]();
    provider[Symbol.dispose]();
    expect(fromSession.disposed).toBe(0);
    expect(fromBuilt.disposed).toBe(0);
  });
});

describe('the walk', () => {
  test('disposes in reverse order of capture', () => {
    const order: string[] = [];
    const session = openScope(threeProvider(order), 'session');
    session.resolve(A);
    session.resolve(B);
    session.resolve(C);

    session[Symbol.dispose]();
    expect(order).toEqual(['c', 'b', 'a']);
  });

  test('a shared dependency is disposed after every one of its dependents', () => {
    const order: string[] = [];
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(RECORDER, () => new Recorder('dependency', order), Type.func(RECORDER, [[]]), 'session')
          .add(A, (recorder: Recorder) => new Recorder('a', order), Type.func(A, [[RECORDER]]), 'session')
          .add(B, (recorder: Recorder) => new Recorder('b', order), Type.func(B, [[RECORDER]]), 'session')
      )
      .build();
    const session = openScope(provider, 'session');
    session.resolve(A);
    session.resolve(B);

    session[Symbol.dispose]();
    expect(order).toEqual(['b', 'a', 'dependency']);
  });

  test('one instance captured under several addresses is disposed once, where it was first captured', () => {
    const order: string[] = [];
    const shared = new Recorder('shared', order);
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(A, () => shared, Type.func(A, [[]]), 'session')
          .add(B, () => new Recorder('b', order), Type.func(B, [[]]), 'session')
          .add(C, () => shared, Type.func(C, [[]]), 'session')
      )
      .build();
    const session = openScope(provider, 'session');
    session.resolve(A);
    session.resolve(B);
    session.resolve(C);

    session[Symbol.dispose]();
    expect(shared.disposed).toBe(1);
    expect(order).toEqual(['b', 'shared']);
  });

  test('a second disposal does nothing, in either form', async () => {
    const session = openScope(recorderProvider('session'), 'session');
    const instance = session.resolve(RECORDER) as Recorder;

    session[Symbol.dispose]();
    session[Symbol.dispose]();
    await session[Symbol.asyncDispose]();
    expect(instance.disposed).toBe(1);
  });

  test('disposing one scope touches neither a sibling nor an ancestor', () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(A, Recorder, Type.ctor(A, [[]]), 'session')
          .add(B, Recorder, Type.ctor(B, [[]]), 'request')
      )
      .build();
    const session = openScope(provider, 'session');
    const one = openScope(session, 'request');
    const other = openScope(session, 'request');
    const inSession = one.resolve(A) as Recorder;
    const inOther = other.resolve(B) as Recorder;

    one[Symbol.dispose]();
    expect(inSession.disposed).toBe(0);
    expect(inOther.disposed).toBe(0);
    expect(other.resolve(B)).toBe(inOther);
    expect(session.resolve(A)).toBe(inSession);
  });
});

describe('the two forms against the two protocols', () => {
  test('the synchronous form counts an instance offering only Symbol.asyncDispose as an error and still disposes the rest', () => {
    const order: string[] = [];
    const session = openScope(threeProvider(order, () => new AsyncRecorder('b', order)), 'session');
    session.resolve(A);
    const asyncOnly = session.resolve(B) as AsyncRecorder;
    session.resolve(C);

    expect(() => session[Symbol.dispose]()).toThrow('Symbol.asyncDispose');
    expect(order).toEqual(['c', 'a']);
    expect(asyncOnly.disposed).toBe(0);
  });

  test('the asynchronous form awaits each asynchronous instance and calls a synchronous-only one directly, in order', async () => {
    const order: string[] = [];
    const session = openScope(threeProvider(order, () => new AsyncRecorder('b', order)), 'session');
    session.resolve(A);
    session.resolve(B);
    session.resolve(C);

    await session[Symbol.asyncDispose]();
    expect(order).toEqual(['c', 'b', 'a']);
  });

  test('the asynchronous form prefers Symbol.asyncDispose where an instance offers both', async () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m => m.add(A, DualRecorder, Type.ctor(A, [[]]), 'session'))
      .build();
    const session = openScope(provider, 'session');
    const instance = session.resolve(A) as DualRecorder;

    await session[Symbol.asyncDispose]();
    expect(instance.async).toBe(1);
    expect(instance.sync).toBe(0);
  });

  test('the synchronous form uses Symbol.dispose where an instance offers both', () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m => m.add(A, DualRecorder, Type.ctor(A, [[]]), 'session'))
      .build();
    const session = openScope(provider, 'session');
    const instance = session.resolve(A) as DualRecorder;

    session[Symbol.dispose]();
    expect(instance.sync).toBe(1);
    expect(instance.async).toBe(0);
  });

  test('an await using block disposes a scope through the asynchronous form on exit', async () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m => m.add(A, AsyncRecorder, Type.ctor(A, [[]]), 'request'))
      .build();
    let instance: AsyncRecorder;
    {
      await using request = openScope(provider, 'request');
      instance = request.resolve(A) as AsyncRecorder;
      expect(instance.disposed).toBe(0);
    }
    expect(instance.disposed).toBe(1);
  });
});

describe('errors during disposal', () => {
  test('one failure disposes everything else and rethrows the failure itself', () => {
    const order: string[] = [];
    const session = openScope(threeProvider(order, () => new Throwing(order, 'b')), 'session');
    session.resolve(A);
    session.resolve(B);
    session.resolve(C);

    let caught: unknown;
    try {
      session[Symbol.dispose]();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('b failed');
    expect(order).toEqual(['c', 'b', 'a']);
  });

  test('two failures dispose everything else and throw one AggregateError carrying both', () => {
    const order: string[] = [];
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(A, () => new Throwing(order, 'a'), Type.func(A, [[]]), 'session')
          .add(B, () => new Recorder('b', order), Type.func(B, [[]]), 'session')
          .add(C, () => new Throwing(order, 'c'), Type.func(C, [[]]), 'session')
      )
      .build();
    const session = openScope(provider, 'session');
    session.resolve(A);
    session.resolve(B);
    session.resolve(C);

    let caught: unknown;
    try {
      session[Symbol.dispose]();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors.map(error => (error as Error).message)).toEqual(['c failed', 'a failed']);
    expect(order).toEqual(['c', 'b', 'a']);
  });

  test('the asynchronous form rethrows one failure as itself', async () => {
    const order: string[] = [];
    const session = openScope(threeProvider(order, () => new Throwing(order, 'b')), 'session');
    session.resolve(A);
    session.resolve(B);
    session.resolve(C);

    let caught: unknown;
    try {
      await session[Symbol.asyncDispose]();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('b failed');
    expect(order).toEqual(['c', 'b', 'a']);
  });

  test('the asynchronous form aggregates the same way', async () => {
    const order: string[] = [];
    class ThrowingAsync {
      async [Symbol.asyncDispose](): Promise<void> {
        order.push('async');
        throw new Error('async failed');
      }
    }
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m
          .add(A, () => new Throwing(order, 'a'), Type.func(A, [[]]), 'session')
          .add(B, () => new ThrowingAsync(), Type.func(B, [[]]), 'session')
          .add(C, () => new Recorder('c', order), Type.func(C, [[]]), 'session')
      )
      .build();
    const session = openScope(provider, 'session');
    session.resolve(A);
    session.resolve(B);
    session.resolve(C);

    let caught: unknown;
    try {
      await session[Symbol.asyncDispose]();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toHaveLength(2);
    expect(order).toEqual(['c', 'async', 'a']);
  });
});

describe('after disposal', () => {
  test('a disposed scope refuses every ask, while its siblings and the built provider go on', () => {
    const provider = recorderProvider('session');
    const session = openScope(provider, 'session');
    const other = openScope(provider, 'session');
    session[Symbol.dispose]();

    expect(() => session.resolve(RECORDER)).toThrow(ObjectDisposedError);
    expect(other.resolve(RECORDER)).toBeInstanceOf(Recorder);
    expect(provider.resolve(RECORDER)).toBeInstanceOf(Recorder);
    expect(openScope(provider, 'session').resolve(RECORDER)).toBeInstanceOf(Recorder);
  });

  test('every scope beneath a disposed scope refuses with it', () => {
    const provider = recorderProvider('request');
    const session = openScope(provider, 'session');
    const request = openScope(session, 'request');
    const deeper = openScope(request, 'request');
    request.resolve(RECORDER);
    session[Symbol.dispose]();

    expect(() => request.resolve(RECORDER)).toThrow(ObjectDisposedError);
    expect(() => deeper.resolve(RECORDER)).toThrow(ObjectDisposedError);
    expect(() => request.resolve(SCOPE_FACTORY)).toThrow(ObjectDisposedError);
  });

  test('a scope opened beneath a disposed scope refuses from the start', () => {
    const provider = recorderProvider('request');
    const session = openScope(provider, 'session');
    const factory = session.resolve(SCOPE_FACTORY) as ITaggedServiceScopeFactory<Lifetime>;
    session[Symbol.dispose]();

    expect(() => factory.openScope('request').resolve(RECORDER)).toThrow(ObjectDisposedError);
  });

  test("disposing the built provider ends every scope's resolutions", () => {
    const provider = recorderProvider('session');
    const session = openScope(provider, 'session');
    const request = openScope(session, 'request');
    const factory = provider.resolve(SCOPE_FACTORY) as ITaggedServiceScopeFactory<Lifetime>;
    request.resolve(RECORDER);
    provider[Symbol.dispose]();

    expect(() => provider.resolve(RECORDER)).toThrow(ObjectDisposedError);
    expect(() => session.resolve(RECORDER)).toThrow(ObjectDisposedError);
    expect(() => request.resolve(RECORDER)).toThrow(ObjectDisposedError);
    expect(() => factory.openScope('session').resolve(RECORDER)).toThrow(ObjectDisposedError);
  });

  test('disposing the built provider leaves what an open scope owns to that scope', () => {
    const provider = recorderProvider('session');
    const session = openScope(provider, 'session');
    const instance = session.resolve(RECORDER) as Recorder;

    provider[Symbol.dispose]();
    expect(instance.disposed).toBe(0);
    session[Symbol.dispose]();
    expect(instance.disposed).toBe(1);
  });

  test('a latebound closure minted in a scope refuses once that scope is disposed', () => {
    const provider = recorderProvider('session');
    const session = openScope(provider, 'session');
    const make = session.resolve(Type.func(RECORDER, [[]])) as () => Recorder;
    session[Symbol.dispose]();
    expect(() => make()).toThrow(ObjectDisposedError);
  });

  test('a latebound closure refuses without constructing, whether or not what it makes is disposable', () => {
    let built = 0;
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m.add(A, () => {
          built++;
          return {};
        }, Type.func(A, [[]]), 'session')
      )
      .build();
    const session = openScope(provider, 'session');
    const request = openScope(session, 'request');
    const make = request.resolve(Type.func(A, [[]])) as () => object;
    session[Symbol.dispose]();

    expect(() => make()).toThrow(ObjectDisposedError);
    expect(built).toBe(0);
  });

  test('a latebound closure minted from the built provider refuses once the built provider is disposed', () => {
    const provider = recorderProvider();
    const make = provider.resolve(Type.func(RECORDER, [[]])) as () => Recorder;
    provider[Symbol.dispose]();
    expect(() => make()).toThrow(ObjectDisposedError);
  });

  test('an instance constructed while its scope is disposing is disposed at once and the ask refuses', () => {
    let session: IDisposableServiceProvider | undefined;
    const order: string[] = [];
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m =>
        m.add(RECORDER, () => {
          session![Symbol.dispose]();
          return new Recorder('late', order);
        }, Type.func(RECORDER, [[]]), 'session')
      )
      .build();
    session = openScope(provider, 'session');

    expect(() => session!.resolve(RECORDER)).toThrow(ObjectDisposedError);
    expect(order).toEqual(['late']);
  });
});

describe('asynchronous products', () => {
  test('a promise product is captured on settlement and disposed with its scope', async () => {
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m => m.add(RECORDER, async () => new Recorder(), Type.func(Type.promise(RECORDER), [[]]), 'session'))
      .build();
    const session = openScope(provider, 'session');
    const instance = await session.resolveAsync(RECORDER) as Recorder;

    session[Symbol.dispose]();
    expect(instance.disposed).toBe(1);
  });

  test('a promise product still pending when its scope ends is disposed on settlement', async () => {
    let settle: (recorder: Recorder) => void = () => undefined;
    const provider = Builder.useAddon(taggedLifetime<Lifetime>())
      .withServices(m => m.add(RECORDER, () => new Promise<Recorder>(resolve => (settle = resolve)), Type.func(Type.promise(RECORDER), [[]]), 'request'))
      .build();
    const request = openScope(provider, 'request');
    const pending = request.resolveAsync(RECORDER) as Promise<Recorder>;
    request[Symbol.dispose]();

    const instance = new Recorder();
    settle(instance);
    await pending;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(instance.disposed).toBe(1);
  });
});
