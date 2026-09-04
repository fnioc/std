// Behaviour tests for disposal under the standard lifetime model: what a scope captures and
// which scope owns it, the order and deduplication of the walk, how errors aggregate, the two
// forms against the two protocols, and what every provider refuses once its scope has ended.

import { Builder, standardLifetime } from '@rhombus-std/di';
import { type IDisposableServiceProvider, type IServiceProvider, type IServiceScopeFactory, ObjectDisposedError, type StandardLifetime } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const SCOPE_FACTORY = Type.imported('IServiceScopeFactory', '@rhombus-std/di.core');
const PROVIDER = Type.imported('IServiceProvider', '@rhombus-std/di.core');
const RECORDER = Type.imported('Recorder', 'app');
const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');
const C = Type.imported('C', 'app');
const HOLDER = Type.imported('Holder', 'app');
const FAILING = Type.imported('Failing', 'app');

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

function openScope(provider: IServiceProvider): IDisposableServiceProvider {
  return (provider.resolve(SCOPE_FACTORY) as IServiceScopeFactory).openScope();
}

/** A container over a factory-made {@link Recorder} alone, under `lifetime`. */
function recorderProvider(lifetime: StandardLifetime, order: string[] = []): IDisposableServiceProvider {
  return Builder.useAddon(standardLifetime())
    .withServices(m => m.add(RECORDER, () => new Recorder('recorder', order), Type.func(RECORDER, [[]]), lifetime))
    .build();
}

describe('what is captured', () => {
  test('a constructed singleton is disposed with the container', () => {
    const provider = recorderProvider('singleton');
    const instance = provider.resolve(RECORDER) as Recorder;
    provider[Symbol.dispose]();
    expect(instance.disposed).toBe(1);
  });

  test('a factory-made instance is disposed like a constructed one', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(RECORDER, Recorder, Type.ctor(RECORDER, [[]]), 'singleton'))
      .build();
    const instance = provider.resolve(RECORDER) as Recorder;
    provider[Symbol.dispose]();
    expect(instance.disposed).toBe(1);
  });

  test('an instance handed to a registration is never disposed by the container', () => {
    const instance = new Recorder();
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.addValue(RECORDER, instance))
      .build();
    provider.resolve(RECORDER);
    openScope(provider).resolve(RECORDER);
    provider[Symbol.dispose]();
    expect(instance.disposed).toBe(0);
  });

  test('an instance offering neither protocol is simply not tracked', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(A, () => ({}), Type.func(A, [[]]), 'singleton'))
      .build();
    provider.resolve(A);
    expect(() => provider[Symbol.dispose]()).not.toThrow();
  });

  test('a scoped instance is disposed with its scope, and only then', () => {
    const provider = recorderProvider('scoped');
    const scope = openScope(provider);
    const instance = scope.resolve(RECORDER) as Recorder;
    const other = openScope(provider).resolve(RECORDER) as Recorder;

    scope[Symbol.dispose]();
    expect(instance.disposed).toBe(1);
    expect(other.disposed).toBe(0);
  });

  test("a scoped instance reached from the container's own provider is disposed with the container", () => {
    const provider = recorderProvider('scoped');
    const instance = provider.resolve(RECORDER) as Recorder;
    provider[Symbol.dispose]();
    expect(instance.disposed).toBe(1);
  });
});

describe('which scope owns a transient', () => {
  test('a transient resolved from a scope is disposed with that scope', () => {
    const provider = recorderProvider('transient');
    const scope = openScope(provider);
    const fromScope = scope.resolve(RECORDER) as Recorder;
    const fromContainer = provider.resolve(RECORDER) as Recorder;

    scope[Symbol.dispose]();
    expect(fromScope.disposed).toBe(1);
    expect(fromContainer.disposed).toBe(0);

    provider[Symbol.dispose]();
    expect(fromContainer.disposed).toBe(1);
  });

  test("a transient resolved from the container's own provider is held until the container disposes", () => {
    const provider = recorderProvider('transient');
    const first = provider.resolve(RECORDER) as Recorder;
    const second = provider.resolve(RECORDER) as Recorder;
    openScope(provider)[Symbol.dispose]();
    expect(first.disposed).toBe(0);

    provider[Symbol.dispose]();
    expect(first.disposed).toBe(1);
    expect(second.disposed).toBe(1);
  });

  test('a transient holding the provider it was resolved from is disposed with its scope, exactly once', () => {
    const HOLDING = Type.imported('ProviderHolder', 'app');
    class ProviderHolder {
      disposed = 0;
      constructor(readonly provider: IServiceProvider) {}
      [Symbol.dispose](): void {
        this.disposed++;
      }
    }
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(HOLDING, ProviderHolder, Type.ctor(HOLDING, [[PROVIDER]]), 'transient'))
      .build();
    const scope = openScope(provider);
    const held = scope.resolve(HOLDING) as ProviderHolder;
    expect(held.provider).toBe(scope);

    scope[Symbol.dispose]();
    expect(held.disposed).toBe(1);
    provider[Symbol.dispose]();
    expect(held.disposed).toBe(1);
  });

  test('a transient injected into a singleton is owned by the container, wherever the singleton was reached', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(RECORDER, Recorder, Type.ctor(RECORDER, [[]]), 'transient')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[RECORDER]]), 'singleton')
      )
      .build();
    const scope = openScope(provider);
    const holder = scope.resolve(HOLDER) as Holder;

    scope[Symbol.dispose]();
    expect(holder.recorder.disposed).toBe(0);
    provider[Symbol.dispose]();
    expect(holder.recorder.disposed).toBe(1);
  });

  test('a transient injected into a scoped registration is owned by that scope', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(RECORDER, Recorder, Type.ctor(RECORDER, [[]]), 'transient')
          .add(HOLDER, Holder, Type.ctor(HOLDER, [[RECORDER]]), 'scoped')
      )
      .build();
    const scope = openScope(provider);
    const holder = scope.resolve(HOLDER) as Holder;

    scope[Symbol.dispose]();
    expect(holder.recorder.disposed).toBe(1);
  });

  test('an instance constructed during an ask that later fails is still owned, and disposed', () => {
    const order: string[] = [];
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(RECORDER, () => new Recorder('recorder', order), Type.func(RECORDER, [[]]), 'transient')
          .add(FAILING, () => {
            throw new Error('boom');
          }, Type.func(FAILING, [[]]), 'transient')
          .add(HOLDER, (recorder: Recorder, _failing: unknown) => new Holder(recorder), Type.func(HOLDER, [[RECORDER, FAILING]]), 'transient')
      )
      .build();
    const scope = openScope(provider);

    expect(() => scope.resolve(HOLDER)).toThrow('boom');
    scope[Symbol.dispose]();
    expect(order).toEqual(['recorder']);
  });
});

describe('the walk', () => {
  test('disposes in reverse order of creation', () => {
    const order: string[] = [];
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(A, () => new Recorder('a', order), Type.func(A, [[]]), 'singleton')
          .add(B, () => new Recorder('b', order), Type.func(B, [[]]), 'singleton')
          .add(C, () => new Recorder('c', order), Type.func(C, [[]]), 'transient')
      )
      .build();
    provider.resolve(A);
    provider.resolve(B);
    provider.resolve(C);

    provider[Symbol.dispose]();
    expect(order).toEqual(['c', 'b', 'a']);
  });

  test('a shared dependency is disposed after every one of its dependents', () => {
    const order: string[] = [];
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(RECORDER, () => new Recorder('dependency', order), Type.func(RECORDER, [[]]), 'singleton')
          .add(A, (recorder: Recorder) => new Recorder('a', order), Type.func(A, [[RECORDER]]), 'singleton')
          .add(B, (recorder: Recorder) => new Recorder('b', order), Type.func(B, [[RECORDER]]), 'singleton')
      )
      .build();
    provider.resolve(A);
    provider.resolve(B);

    provider[Symbol.dispose]();
    expect(order).toEqual(['b', 'a', 'dependency']);
  });

  test('one instance captured under several addresses is disposed once, where it was first captured', () => {
    const order: string[] = [];
    const shared = new Recorder('shared', order);
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(A, () => shared, Type.func(A, [[]]), 'singleton')
          .add(B, () => new Recorder('b', order), Type.func(B, [[]]), 'singleton')
          .add(C, () => shared, Type.func(C, [[]]), 'singleton')
      )
      .build();
    provider.resolve(A);
    provider.resolve(B);
    provider.resolve(C);

    provider[Symbol.dispose]();
    expect(shared.disposed).toBe(1);
    expect(order).toEqual(['b', 'shared']);
  });

  test('one instance captured under many addresses is still disposed once', () => {
    const shared = new Recorder();
    const addresses = Array.from({ length: 20 }, (_, i) => Type.imported(`Alias${i}`, 'app'));
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => addresses.reduce((manifest, address) => manifest.add(address, () => shared, Type.func(address, [[]]), 'singleton'), m))
      .build();
    for (const address of addresses) {
      provider.resolve(address);
    }

    provider[Symbol.dispose]();
    expect(shared.disposed).toBe(1);
  });

  test('a second disposal does nothing, in either form', async () => {
    const provider = recorderProvider('singleton');
    const instance = provider.resolve(RECORDER) as Recorder;

    provider[Symbol.dispose]();
    provider[Symbol.dispose]();
    await provider[Symbol.asyncDispose]();
    expect(instance.disposed).toBe(1);
  });

  test("disposing the container leaves an open scope's own instances to that scope", () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(A, Recorder, Type.ctor(A, [[]]), 'singleton')
          .add(B, Recorder, Type.ctor(B, [[]]), 'scoped')
      )
      .build();
    const scope = openScope(provider);
    const singleton = provider.resolve(A) as Recorder;
    const scoped = scope.resolve(B) as Recorder;

    provider[Symbol.dispose]();
    expect(singleton.disposed).toBe(1);
    expect(scoped.disposed).toBe(0);

    scope[Symbol.dispose]();
    expect(scoped.disposed).toBe(1);
  });

  test('disposing the scope a factory was resolved from leaves the scope it opened untouched: scopes are flat', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(B, Recorder, Type.ctor(B, [[]]), 'scoped'))
      .build();
    const outer = openScope(provider);
    const inner = openScope(outer);
    const kept = inner.resolve(B) as Recorder;

    outer[Symbol.dispose]();
    expect(kept.disposed).toBe(0);
    expect(inner.resolve(B)).toBe(kept);
    expect(() => outer.resolve(B)).toThrow(ObjectDisposedError);

    inner[Symbol.dispose]();
    expect(kept.disposed).toBe(1);
  });

  test('a singleton dependency constructed before a sibling throws is owned by the container, and disposed with it', () => {
    const order: string[] = [];
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(RECORDER, () => new Recorder('recorder', order), Type.func(RECORDER, [[]]), 'singleton')
          .add(FAILING, () => {
            throw new Error('boom');
          }, Type.func(FAILING, [[]]), 'transient')
          .add(HOLDER, (recorder: Recorder, _failing: unknown) => new Holder(recorder), Type.func(HOLDER, [[RECORDER, FAILING]]), 'transient')
      )
      .build();
    const scope = openScope(provider);

    expect(() => scope.resolve(HOLDER)).toThrow('boom');
    scope[Symbol.dispose]();
    expect(order).toEqual([]);
    provider[Symbol.dispose]();
    expect(order).toEqual(['recorder']);
  });

  test('the built-in registrations are never captured: a scope handing out its provider and a singleton holding the factory dispose cleanly', () => {
    const HOLDING = Type.imported('FactoryHolder', 'app');
    class FactoryHolder {
      constructor(readonly factory: IServiceScopeFactory, readonly provider: IServiceProvider) {}
    }
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(HOLDING, FactoryHolder, Type.ctor(HOLDING, [[SCOPE_FACTORY, PROVIDER]]), 'singleton'))
      .build();
    const scope = openScope(provider);
    expect(scope.resolve(PROVIDER)).toBe(scope);
    expect(scope.resolve(PROVIDER)).toBe(scope);
    const holder = scope.resolve(HOLDING) as FactoryHolder;

    scope[Symbol.dispose]();
    expect(holder.factory.openScope().resolve(PROVIDER)).not.toBe(scope);
    expect(holder.provider.resolve(HOLDING)).toBe(holder);
    provider[Symbol.dispose]();
    expect(() => holder.factory.openScope()).toThrow(ObjectDisposedError);
  });

  test('disposing one scope touches neither another scope nor the singletons', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(A, Recorder, Type.ctor(A, [[]]), 'singleton')
          .add(B, Recorder, Type.ctor(B, [[]]), 'scoped')
      )
      .build();
    const one = openScope(provider);
    const other = openScope(provider);
    const singleton = one.resolve(A) as Recorder;
    const inOther = other.resolve(B) as Recorder;

    one[Symbol.dispose]();
    expect(singleton.disposed).toBe(0);
    expect(inOther.disposed).toBe(0);
    expect(other.resolve(B)).toBe(inOther);
  });
});

describe('the two forms against the two protocols', () => {
  test('the synchronous form counts an instance offering only Symbol.asyncDispose as an error and still disposes the rest', () => {
    const order: string[] = [];
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(A, () => new Recorder('a', order), Type.func(A, [[]]), 'singleton')
          .add(B, () => new AsyncRecorder('b', order), Type.func(B, [[]]), 'singleton')
          .add(C, () => new Recorder('c', order), Type.func(C, [[]]), 'singleton')
      )
      .build();
    provider.resolve(A);
    const asyncOnly = provider.resolve(B) as AsyncRecorder;
    provider.resolve(C);

    expect(() => provider[Symbol.dispose]()).toThrow('Symbol.asyncDispose');
    expect(order).toEqual(['c', 'a']);
    expect(asyncOnly.disposed).toBe(0);
  });

  test('the asynchronous form awaits each asynchronous instance and calls a synchronous-only one directly, in order', async () => {
    const order: string[] = [];
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(A, () => new Recorder('a', order), Type.func(A, [[]]), 'singleton')
          .add(B, () => new AsyncRecorder('b', order), Type.func(B, [[]]), 'singleton')
          .add(C, () => new Recorder('c', order), Type.func(C, [[]]), 'singleton')
      )
      .build();
    provider.resolve(A);
    provider.resolve(B);
    provider.resolve(C);

    await provider[Symbol.asyncDispose]();
    expect(order).toEqual(['c', 'b', 'a']);
  });

  test('the asynchronous form prefers Symbol.asyncDispose where an instance offers both', async () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(A, DualRecorder, Type.ctor(A, [[]]), 'singleton'))
      .build();
    const instance = provider.resolve(A) as DualRecorder;

    await provider[Symbol.asyncDispose]();
    expect(instance.async).toBe(1);
    expect(instance.sync).toBe(0);
  });

  test('the synchronous form uses Symbol.dispose where an instance offers both', () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(A, DualRecorder, Type.ctor(A, [[]]), 'singleton'))
      .build();
    const instance = provider.resolve(A) as DualRecorder;

    provider[Symbol.dispose]();
    expect(instance.sync).toBe(1);
    expect(instance.async).toBe(0);
  });

  test('an await using block disposes a scope through the asynchronous form on exit', async () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(A, AsyncRecorder, Type.ctor(A, [[]]), 'scoped'))
      .build();
    let instance: AsyncRecorder;
    {
      await using scope = openScope(provider);
      instance = scope.resolve(A) as AsyncRecorder;
      expect(instance.disposed).toBe(0);
    }
    expect(instance.disposed).toBe(1);
  });
});

describe('errors during disposal', () => {
  class Throwing {
    constructor(readonly order: string[], readonly id: string) {}
    [Symbol.dispose](): void {
      this.order.push(this.id);
      throw new Error(`${this.id} failed`);
    }
  }

  test('one failure disposes everything else and rethrows the failure itself', () => {
    const order: string[] = [];
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(A, () => new Recorder('a', order), Type.func(A, [[]]), 'singleton')
          .add(B, () => new Throwing(order, 'b'), Type.func(B, [[]]), 'singleton')
          .add(C, () => new Recorder('c', order), Type.func(C, [[]]), 'singleton')
      )
      .build();
    provider.resolve(A);
    provider.resolve(B);
    provider.resolve(C);

    let caught: unknown;
    try {
      provider[Symbol.dispose]();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toBe('b failed');
    expect(order).toEqual(['c', 'b', 'a']);
  });

  test('two failures dispose everything else and throw one AggregateError carrying both', () => {
    const order: string[] = [];
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(A, () => new Throwing(order, 'a'), Type.func(A, [[]]), 'singleton')
          .add(B, () => new Recorder('b', order), Type.func(B, [[]]), 'singleton')
          .add(C, () => new Throwing(order, 'c'), Type.func(C, [[]]), 'singleton')
      )
      .build();
    provider.resolve(A);
    provider.resolve(B);
    provider.resolve(C);

    let caught: unknown;
    try {
      provider[Symbol.dispose]();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors.map(error => (error as Error).message)).toEqual(['c failed', 'a failed']);
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
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m
          .add(A, () => new Throwing(order, 'a'), Type.func(A, [[]]), 'singleton')
          .add(B, () => new ThrowingAsync(), Type.func(B, [[]]), 'singleton')
          .add(C, () => new Recorder('c', order), Type.func(C, [[]]), 'singleton')
      )
      .build();
    provider.resolve(A);
    provider.resolve(B);
    provider.resolve(C);

    let caught: unknown;
    try {
      await provider[Symbol.asyncDispose]();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toHaveLength(2);
    expect(order).toEqual(['c', 'async', 'a']);
  });
});

describe('after disposal', () => {
  test('resolving from a disposed scope refuses, while the container and other scopes go on', () => {
    const provider = recorderProvider('scoped');
    const scope = openScope(provider);
    const other = openScope(provider);
    scope[Symbol.dispose]();

    expect(() => scope.resolve(RECORDER)).toThrow(ObjectDisposedError);
    expect(other.resolve(RECORDER)).toBeInstanceOf(Recorder);
    expect(openScope(provider).resolve(RECORDER)).toBeInstanceOf(Recorder);
  });

  test('resolving from the disposed container refuses', () => {
    const provider = recorderProvider('singleton');
    provider.resolve(RECORDER);
    provider[Symbol.dispose]();
    expect(() => provider.resolve(RECORDER)).toThrow(ObjectDisposedError);
  });

  test('a disposed scope refuses before any construction runs', () => {
    let built = 0;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m.add(A, () => {
          built++;
          return new Recorder();
        }, Type.func(A, [[]]), 'transient')
      )
      .build();
    const scope = openScope(provider);
    scope.resolve(A);
    expect(built).toBe(1);

    scope[Symbol.dispose]();
    expect(() => scope.resolve(A)).toThrow(ObjectDisposedError);
    expect(built).toBe(1);
  });

  test('the disposed container refuses before any construction runs', () => {
    let built = 0;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m.add(A, () => {
          built++;
          return new Recorder();
        }, Type.func(A, [[]]), 'transient')
      )
      .build();
    provider.resolve(A);
    expect(built).toBe(1);

    provider[Symbol.dispose]();
    expect(() => provider.resolve(A)).toThrow(ObjectDisposedError);
    expect(built).toBe(1);
  });

  test('resolving from a scope that was open when the container was disposed refuses', () => {
    const provider = recorderProvider('scoped');
    const scope = openScope(provider);
    scope.resolve(RECORDER);
    provider[Symbol.dispose]();
    expect(() => scope.resolve(RECORDER)).toThrow(ObjectDisposedError);
  });

  test('opening a scope from the disposed container refuses, through a factory resolved earlier', () => {
    const provider = recorderProvider('scoped');
    const factory = provider.resolve(SCOPE_FACTORY) as IServiceScopeFactory;
    provider[Symbol.dispose]();
    expect(() => factory.openScope()).toThrow(ObjectDisposedError);
  });

  test('a scope factory resolved from a disposed scope still opens scopes: it belongs to the container', () => {
    const provider = recorderProvider('scoped');
    const scope = openScope(provider);
    const factory = scope.resolve(SCOPE_FACTORY) as IServiceScopeFactory;
    scope[Symbol.dispose]();
    expect(factory.openScope().resolve(RECORDER)).toBeInstanceOf(Recorder);
  });

  test('a latebound closure minted in a scope refuses once that scope is disposed', () => {
    const provider = recorderProvider('transient');
    const scope = openScope(provider);
    const make = scope.resolve(Type.func(RECORDER, [[]])) as () => Recorder;
    scope[Symbol.dispose]();
    expect(() => make()).toThrow(ObjectDisposedError);
  });

  test('an instance constructed while its scope is disposing is disposed at once and the ask refuses', () => {
    let scope: IDisposableServiceProvider | undefined;
    const order: string[] = [];
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m.add(RECORDER, () => {
          scope![Symbol.dispose]();
          return new Recorder('late', order);
        }, Type.func(RECORDER, [[]]), 'scoped')
      )
      .build();
    scope = openScope(provider);

    expect(() => scope!.resolve(RECORDER)).toThrow(ObjectDisposedError);
    expect(order).toEqual(['late']);
  });
});

describe('a registered array', () => {
  const RECORDERS = Type.array(RECORDER);

  /** An array that disposes as one unit, logging `whole` — its elements log their own ids. */
  function recorders(order: string[]): Recorder[] {
    return Object.assign([new Recorder('first', order), new Recorder('second', order)], {
      [Symbol.dispose]: () => order.push('whole'),
    });
  }

  test('is one service under one lifetime: the same instance throughout its scope', () => {
    let made = 0;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m =>
        m.add(RECORDERS, () => {
          made++;
          return recorders([]);
        }, Type.func(RECORDERS, [[]]), 'scoped')
      )
      .build();
    const scope = openScope(provider);

    expect(scope.resolve(RECORDERS)).toBe(scope.resolve(RECORDERS));
    expect(made).toBe(1);
  });

  test('is disposed as one unit when its scope ends, its elements never individually', () => {
    const order: string[] = [];
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(RECORDERS, () => recorders(order), Type.func(RECORDERS, [[]]), 'scoped'))
      .build();
    const scope = openScope(provider);
    const array = scope.resolve(RECORDERS) as Recorder[];

    scope[Symbol.dispose]();
    expect(order).toEqual(['whole']);
    expect(array.map(element => element.disposed)).toEqual([0, 0]);
  });

  test('offering no disposal protocol of its own, nothing it holds is disposed with the container', () => {
    const order: string[] = [];
    const elements = [new Recorder('first', order), new Recorder('second', order)];
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(RECORDERS, () => elements, Type.func(RECORDERS, [[]]), 'singleton'))
      .build();

    expect(provider.resolve(RECORDERS)).toBe(elements);
    provider[Symbol.dispose]();
    expect(order).toEqual([]);
  });
});

describe('asynchronous products', () => {
  test('a promise product is captured on settlement and disposed with its scope', async () => {
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(RECORDER, async () => new Recorder(), Type.func(Type.promise(RECORDER), [[]]), 'singleton'))
      .build();
    const instance = await provider.resolveAsync(RECORDER) as Recorder;

    provider[Symbol.dispose]();
    expect(instance.disposed).toBe(1);
  });

  test('a singleton promise product still pending when the container ends is disposed on settlement, and the ask it was answering is refused', async () => {
    let settle: (recorder: Recorder) => void = () => undefined;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(RECORDER, () => new Promise<Recorder>(resolve => (settle = resolve)), Type.func(Type.promise(RECORDER), [[]]), 'singleton'))
      .build();
    const pending = provider.resolveAsync(RECORDER) as Promise<Recorder>;
    provider[Symbol.dispose]();

    const instance = new Recorder();
    settle(instance);
    await expect(pending).rejects.toThrow(ObjectDisposedError);
    expect(instance.disposed).toBe(1);
  });

  test('a promise product still pending when its scope ends is disposed on settlement, and the ask it was answering is refused', async () => {
    let settle: (recorder: Recorder) => void = () => undefined;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(RECORDER, () => new Promise<Recorder>(resolve => (settle = resolve)), Type.func(Type.promise(RECORDER), [[]]), 'scoped'))
      .build();
    const scope = openScope(provider);
    const pending = scope.resolveAsync(RECORDER) as Promise<Recorder>;
    scope[Symbol.dispose]();

    const instance = new Recorder();
    settle(instance);
    await expect(pending).rejects.toThrow(ObjectDisposedError);
    expect(instance.disposed).toBe(1);
  });

  test('a product with nothing to dispose is refused just the same when its scope ended while it was pending', async () => {
    let settle: (value: object) => void = () => undefined;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(A, () => new Promise<object>(resolve => (settle = resolve)), Type.func(Type.promise(A), [[]]), 'scoped'))
      .build();
    const scope = openScope(provider);
    const pending = scope.resolveAsync(A) as Promise<object>;
    scope[Symbol.dispose]();

    settle({});
    await expect(pending).rejects.toThrow(ObjectDisposedError);
  });

  test('a scope that is still open when the product settles answers the ask and owns the instance', async () => {
    let settle: (recorder: Recorder) => void = () => undefined;
    const provider = Builder.useAddon(standardLifetime())
      .withServices(m => m.add(RECORDER, () => new Promise<Recorder>(resolve => (settle = resolve)), Type.func(Type.promise(RECORDER), [[]]), 'scoped'))
      .build();
    const scope = openScope(provider);
    const pending = scope.resolveAsync(RECORDER) as Promise<Recorder>;

    const instance = new Recorder();
    settle(instance);
    expect(await pending).toBe(instance);
    expect(instance.disposed).toBe(0);

    scope[Symbol.dispose]();
    expect(instance.disposed).toBe(1);
  });
});
