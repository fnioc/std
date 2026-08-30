// Behaviour tests for §225 instance disposal on the standard lifetime model: the disposed
// latch, LIFO release with reference dedup, the children-before-parent cascade, the sync/async
// dispose-protocol preference, and the release-policy widening on the standard datum.

import { di, standard, StandardScopeFactory, StandardScopeTeardown } from '@rhombus-std/di';
import { type IServiceProvider, LifetimeModelError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const COUNTER = Type.imported('Counter', 'app');
const WIDGET = Type.imported('Widget', 'app');
const RECORDER = Type.imported('Recorder', 'app');
const A = Type.imported('A', 'app');
const B = Type.imported('B', 'app');

class Counter {}

class Widget {}

/** A disposable double: `[Symbol.dispose]` flips {@link disposed} — nothing more. */
class Recorder {
  disposed = false;
  [Symbol.dispose](): void {
    this.disposed = true;
  }
}

/** Pushes `id` onto a shared order log when disposed, so a test can assert release order. */
class OrderRecorder {
  readonly #id: string;
  readonly #order: string[];

  constructor(id: string, order: string[]) {
    this.#id = id;
    this.#order = order;
  }

  [Symbol.dispose](): void {
    this.#order.push(this.#id);
  }
}

/** Counts how many times `[Symbol.dispose]` ran, so a test can assert it ran exactly once. */
class CountingRecorder {
  disposeCount = 0;
  [Symbol.dispose](): void {
    this.disposeCount++;
  }
}

/** Implements both protocols, each flipping its own flag, so a test can see which one ran. */
class DualProtocolRecorder {
  syncCalled = false;
  asyncCalled = false;
  [Symbol.dispose](): void {
    this.syncCalled = true;
  }
  [Symbol.asyncDispose](): Promise<void> {
    this.asyncCalled = true;
    return Promise.resolve();
  }
}

/** Implements only the asynchronous protocol — a synchronous dispose has nothing it can call. */
class AsyncOnlyRecorder {
  [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  }
}

/** A container whose only registration is {@link Counter} under `lifetime`. */
function buildProviderFor(lifetime: 'singleton' | 'scoped' | 'transient'): IServiceProvider {
  return di.usingLifetimeModel(standard())
    .configureServices(manifest => manifest.add(COUNTER, Counter, Type.ctor(COUNTER, [[]]), lifetime))
    .build();
}

/** Opens a scope the way a user without the engine-typed provider does — through the published address. */
function openScope(provider: IServiceProvider): IServiceProvider {
  return (provider.resolve(StandardScopeFactory.address) as StandardScopeFactory).openScope();
}

/**
 * Reaches the teardown the model publishes, the way §225 line 3966 has root reached — by
 * resolution, mirroring how a scope is opened.
 */
function readTeardownFrom(provider: IServiceProvider): StandardScopeTeardown {
  return provider.resolve(StandardScopeTeardown.address) as StandardScopeTeardown;
}

/**
 * A model-minted scope object, seen as the disposal-bearing shape it carries at runtime —
 * `IServiceProvider` itself declares neither symbol (§225 line 3966), so a test invoking them
 * reaches for this rather than widening the interface.
 */
function readMintedDisposal(scope: IServiceProvider): Disposable & AsyncDisposable {
  return scope as unknown as Disposable & AsyncDisposable;
}

describe('the disposed latch', () => {
  // §225 line 3962 — "the model's own minted provider objects and keeper refuse any ask after
  // teardown" — with root reached the way line 3966 has it reached, by resolution.
  test('refuses every ask once its scope — root included — has been torn down', () => {
    const provider = buildProviderFor('singleton');
    const scope = openScope(provider);
    readMintedDisposal(scope)[Symbol.dispose]();
    expect(() => scope.resolve(COUNTER)).toThrow();

    readTeardownFrom(provider)[Symbol.dispose]();
    expect(() => provider.resolve(COUNTER)).toThrow();
  });

  // §225 line 3975 — "the standard model throws its own disposed-scope error, surfaced via
  // LifetimeModelError (.cause) — the ScopeTagUnmatchedError precedent."
  test("surfaces the refusal as a LifetimeModelError, the model's own error riding .cause", () => {
    const provider = buildProviderFor('singleton');
    readTeardownFrom(provider)[Symbol.dispose]();

    let caught: unknown;
    try {
      provider.resolve(COUNTER);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(LifetimeModelError);
    expect(((caught as LifetimeModelError).cause as Error).message).toContain('standard');
  });

  // §225 line 3963 — "a latebound re-entry hits the captured scope model and gets the same
  // refusal."
  test('a latebound closure captured before teardown gets the same refusal once called after it', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(WIDGET, Widget, Type.ctor(WIDGET, [[]]), 'transient'))
      .build();
    const scope = openScope(provider);
    const make = scope.resolve(Type.func(WIDGET, [[]])) as () => Widget;
    readMintedDisposal(scope)[Symbol.dispose]();

    let caught: unknown;
    try {
      make();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(LifetimeModelError);
  });
});

describe('the scope objects the model mints', () => {
  // §225 line 3966 — "No dispose members on ServiceProvider or the func-head surface: root
  // teardown is resolution-driven, mirroring createScope." The provider the builder seals is a
  // plain ServiceProvider over the engine head, not one of the faces the model mints, so root is
  // torn down through the address the model publishes rather than off the provider itself.
  test('the provider the builder seals carries neither symbol, root teardown arriving by resolution', () => {
    const provider = buildProviderFor('scoped');
    expect(Symbol.dispose in provider).toBe(false);
    expect(Symbol.asyncDispose in provider).toBe(false);
    expect(() => readTeardownFrom(provider)[Symbol.dispose]()).not.toThrow();
  });

  // §225 lines 3967-3968 — "its scope objects (root included) carry Symbol.dispose /
  // Symbol.asyncDispose as model-minted values."
  test('an opened scope carries both dispose symbols as model-minted values', () => {
    const provider = buildProviderFor('scoped');
    const scope = openScope(provider);
    expect(Symbol.dispose in scope).toBe(true);
    expect(Symbol.asyncDispose in scope).toBe(true);
  });
});

describe('release order', () => {
  // §225 line 3980 — "Standard-model policy: LIFO release of a scope's kept instances."
  test("releases a scope's kept instances in reverse claim order", () => {
    const order: string[] = [];
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest
          .add(A, () => new OrderRecorder('A', order), Type.func(A, [[]]), 'singleton')
          .add(B, () => new OrderRecorder('B', order), Type.func(B, [[]]), 'singleton')
      )
      .build();
    provider.resolve(A);
    provider.resolve(B);
    readTeardownFrom(provider)[Symbol.dispose]();
    expect(order).toEqual(['B', 'A']);
  });

  // §225 line 3981 — "reference-deduped."
  test('disposes one shared instance once, even when two registrations both produced it', () => {
    const shared = new CountingRecorder();
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest
          .add(A, () => shared, Type.func(A, [[]]), 'singleton')
          .add(B, () => shared, Type.func(B, [[]]), 'singleton')
      )
      .build();
    provider.resolve(A);
    provider.resolve(B);
    readTeardownFrom(provider)[Symbol.dispose]();
    expect(shared.disposeCount).toBe(1);
  });

  // §225 line 3981 — "children-before-parent cascade."
  test('tears a child scope down before releasing what the parent itself kept', () => {
    const order: string[] = [];
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest
          .add(A, () => new OrderRecorder('root', order), Type.func(A, [[]]), 'singleton')
          .add(B, () => new OrderRecorder('child', order), Type.func(B, [[]]), 'scoped')
      )
      .build();
    provider.resolve(A);
    const child = openScope(provider);
    child.resolve(B);
    readTeardownFrom(provider)[Symbol.dispose]();
    expect(order).toEqual(['child', 'root']);
  });
});

describe('what the model never tracks', () => {
  // §225 line 3981-3982 — "unkept/transient instances untracked, consumer-owned."
  test('never disposes a transient instance, since nothing tracks it', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(RECORDER, Recorder, Type.ctor(RECORDER, [[]]), 'transient'))
      .build();
    const instance = provider.resolve(RECORDER) as Recorder;
    readTeardownFrom(provider)[Symbol.dispose]();
    expect(instance.disposed).toBe(false);
  });

  // §225 lines 3978-3980 — "value registrations bypass the model and are never tracked."
  test('never disposes a value registration, since it bypasses the model entirely', () => {
    const instance = new Recorder();
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.addValue(RECORDER, instance))
      .build();
    provider.resolve(RECORDER);
    readTeardownFrom(provider)[Symbol.dispose]();
    expect(instance.disposed).toBe(false);
  });
});

describe('tracking needs no addon installed', () => {
  // §225 line 3978 — "the keeper tracks at make time with no new hook, since it performs every
  // make and its disposal knowledge is total by construction."
  test('disposes a kept instance with no addon or behavior installed beyond the model itself', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(RECORDER, Recorder, Type.ctor(RECORDER, [[]]), 'singleton'))
      .build();
    const instance = provider.resolve(RECORDER) as Recorder;
    readTeardownFrom(provider)[Symbol.dispose]();
    expect(instance.disposed).toBe(true);
  });
});

describe('the sync/async dispose-protocol preference', () => {
  // §225 line 3982 — "asyncDispose is preferred over dispose per instance."
  test('async teardown prefers Symbol.asyncDispose over Symbol.dispose when an instance offers both', async () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(RECORDER, DualProtocolRecorder, Type.ctor(RECORDER, [[]]), 'singleton'))
      .build();
    const instance = provider.resolve(RECORDER) as DualProtocolRecorder;
    await readTeardownFrom(provider)[Symbol.asyncDispose]();
    expect(instance.asyncCalled).toBe(true);
    expect(instance.syncCalled).toBe(false);
  });

  // Same line — a preference implies a fallback when the preferred member is absent.
  test('async teardown falls back to Symbol.dispose when that is all an instance offers', async () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(RECORDER, Recorder, Type.ctor(RECORDER, [[]]), 'singleton'))
      .build();
    const instance = provider.resolve(RECORDER) as Recorder;
    await readTeardownFrom(provider)[Symbol.asyncDispose]();
    expect(instance.disposed).toBe(true);
  });

  // §225 lines 3983-3984 — "a synchronous dispose meeting an async-only disposable throws
  // loudly naming the instance's address."
  test('a synchronous teardown meeting an async-only disposable throws, naming the address', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(RECORDER, AsyncOnlyRecorder, Type.ctor(RECORDER, [[]]), 'singleton'))
      .build();
    provider.resolve(RECORDER);

    let caught: unknown;
    try {
      readTeardownFrom(provider)[Symbol.dispose]();
    } catch (error) {
      caught = error;
    }
    // The refusal aggregates like every other release failure (§225 line 3986), so the address it
    // names rides the aggregated failure rather than the message on top.
    const failures = (caught as AggregateError).errors as Error[];
    expect(failures).toHaveLength(1);
    expect(failures.map(failure => failure.message).join()).toContain('Recorder');
  });
});

describe('the promise-boundary product', () => {
  // §225 lines 3984-3985 — "a cached promise product is released by awaiting it and releasing
  // the settled value."
  test('async teardown awaits a cached promise product before releasing what it settles to', async () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest.add(
          Type.promise(RECORDER),
          () => Promise.resolve(new Recorder()),
          Type.func(Type.promise(RECORDER), [[]]),
          'singleton',
        )
      )
      .build();
    const kept = provider.resolve(Type.promise(RECORDER)) as Promise<Recorder>;
    await readTeardownFrom(provider)[Symbol.asyncDispose]();
    expect((await kept).disposed).toBe(true);
  });

  // §225 line 3985 — "a value settling after its scope's dispose is released immediately on
  // arrival": the synchronous counterpart, where the product is still pending when dispose runs.
  test('sync teardown does not wait on a pending promise product, but releases it once it settles', async () => {
    let settle!: (recorder: Recorder) => void;
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest.add(
          Type.promise(RECORDER),
          () =>
            new Promise<Recorder>(resolve => {
              settle = resolve;
            }),
          Type.func(Type.promise(RECORDER), [[]]),
          'singleton',
        )
      )
      .build();
    const kept = provider.resolve(Type.promise(RECORDER)) as Promise<Recorder>;
    expect(() => readTeardownFrom(provider)[Symbol.dispose]()).not.toThrow();

    const recorder = new Recorder();
    settle(recorder);
    await kept;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(recorder.disposed).toBe(true);
  });
});

describe('idempotence', () => {
  // §225 lines 3985-3986 — "A second dispose is an idempotent no-op."
  test('a second synchronous teardown is a no-op, releasing nothing twice', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(RECORDER, CountingRecorder, Type.ctor(RECORDER, [[]]), 'singleton'))
      .build();
    const instance = provider.resolve(RECORDER) as CountingRecorder;
    // One handle, called twice: the scope refuses every ask once torn down, a second teardown ask
    // included, so a second handle is not there to be had.
    const teardown = readTeardownFrom(provider);
    teardown[Symbol.dispose]();
    expect(() => teardown[Symbol.dispose]()).not.toThrow();
    expect(instance.disposeCount).toBe(1);
  });

  test('a second asynchronous teardown is a no-op too', async () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(RECORDER, CountingRecorder, Type.ctor(RECORDER, [[]]), 'singleton'))
      .build();
    const instance = provider.resolve(RECORDER) as CountingRecorder;
    const teardown = readTeardownFrom(provider);
    await teardown[Symbol.asyncDispose]();
    await teardown[Symbol.asyncDispose]();
    expect(instance.disposeCount).toBe(1);
  });
});

describe('release failures', () => {
  // §225 line 3986 — "release failures aggregate, never abort-on-first."
  test('one release failing does not stop another from running, and the failure still surfaces', () => {
    const ran: string[] = [];
    class ThrowingRecorder {
      [Symbol.dispose](): void {
        ran.push('A');
        throw new Error('boom');
      }
    }
    class OkRecorder {
      [Symbol.dispose](): void {
        ran.push('B');
      }
    }

    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest
          .add(A, ThrowingRecorder, Type.ctor(A, [[]]), 'singleton')
          .add(B, OkRecorder, Type.ctor(B, [[]]), 'singleton')
      )
      .build();
    provider.resolve(A);
    provider.resolve(B);

    expect(() => readTeardownFrom(provider)[Symbol.dispose]()).toThrow();
    expect(ran).toEqual(['B', 'A']);
  });
});

describe('the release-policy widening on the standard datum', () => {
  // §225 lines 3970-3973 — "The standard model widens its own datum type to carry release
  // policy (an external-ownership opt-out ...)."
  test('a release of "external" skips teardown entirely, leaving the instance for its owner', () => {
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest => manifest.add(RECORDER, Recorder, Type.ctor(RECORDER, [[]]), { keep: 'singleton', release: 'external' }))
      .build();
    const instance = provider.resolve(RECORDER) as Recorder;
    readTeardownFrom(provider)[Symbol.dispose]();
    expect(instance.disposed).toBe(false);
  });

  // Same lines — "... a release override such as return-to-pool)."
  test("a release override runs in place of the instance's own dispose protocol", () => {
    let overrideRan = false;
    const provider = di.usingLifetimeModel(standard())
      .configureServices(manifest =>
        manifest.add(RECORDER, Recorder, Type.ctor(RECORDER, [[]]), {
          keep: 'singleton',
          release: () => {
            overrideRan = true;
          },
        })
      )
      .build();
    const instance = provider.resolve(RECORDER) as Recorder;
    readTeardownFrom(provider)[Symbol.dispose]();
    expect(overrideRan).toBe(true);
    expect(instance.disposed).toBe(false);
  });
});
