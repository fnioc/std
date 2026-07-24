import { AsyncDisposalRequiredError, ServiceManifest } from '@rhombus-std/di';
import { describe, expect, test } from 'bun:test';
import { AsyncDisposableThing, DisposeLog, NonDisposable, SyncDisposable, T } from './fixtures.js';

// Disposal (native TC39 Disposable / AsyncDisposable only): a scope tracks owned
// instances in construction order and disposes them in REVERSE on close.
// Sync dispose() throws if the scope owns a Promise-valued instance.

describe('sync disposal', () => {
  test('disposes owned instances in reverse construction order', () => {
    const log = new DisposeLog();
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, () => new SyncDisposable('A', log), [[]], 'singleton');
    services = services.addFactory(T.B, () => new SyncDisposable('B', log), [[]], 'singleton');
    services = services.addFactory(T.C, () => new SyncDisposable('C', log), [[]], 'singleton');

    const root = services.build().createScope('singleton');
    root.resolve(T.A); // constructed first
    root.resolve(T.B);
    root.resolve(T.C); // constructed last
    root.dispose();

    // Reverse of construction order: C, B, A.
    expect(log.order).toEqual(['C', 'B', 'A']);
  });

  test('only native Disposable instances are disposed; others untouched', () => {
    const log = new DisposeLog();
    const plain = new NonDisposable('plain');
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, () => new SyncDisposable('A', log), [[]], 'singleton');
    services = services.addFactory(T.B, () => plain, [[]], 'singleton');

    const root = services.build().createScope('singleton');
    const a = root.resolve<SyncDisposable>(T.A);
    root.resolve(T.B);
    root.dispose();

    expect(a.disposed).toBe(true);
    expect(log.order).toEqual(['A']); // the non-disposable contributed nothing
  });

  test("a child scope's dispose does NOT dispose ancestor-owned instances", () => {
    const log = new DisposeLog();
    let services = new ServiceManifest<'singleton' | 'request'>();
    services = services.addFactory(T.A, () => new SyncDisposable('singleton-A', log), [[]], 'singleton');
    services = services.addFactory(T.B, () => new SyncDisposable('request-B', log), [[]], 'request');

    const root = services.build().createScope('singleton');
    const req = root.createScope('request');
    req.resolve(T.A); // owned by root
    req.resolve(T.B); // owned by req

    req.dispose();
    expect(log.order).toEqual(['request-B']); // only req's own instance

    root.dispose();
    expect(log.order).toEqual(['request-B', 'singleton-A']);
  });

  test('dispose is idempotent — a second call is a no-op', () => {
    const log = new DisposeLog();
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, () => new SyncDisposable('A', log), [[]], 'singleton');

    const root = services.build().createScope('singleton');
    root.resolve(T.A);
    root.dispose();
    root.dispose();
    expect(log.order).toEqual(['A']); // disposed exactly once
  });

  test('transient (uncached) instances are NOT tracked for disposal', () => {
    const log = new DisposeLog();
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, () => new SyncDisposable('transient', log), [[]]);
    // no scope ⇒ transient, never cached, never owned

    const root = services.build();
    root.resolve(T.A);
    root.dispose();
    expect(log.order).toEqual([]); // nothing owned ⇒ nothing disposed
  });
});

describe('async disposal', () => {
  test('disposes AsyncDisposable instances in reverse construction order', async () => {
    const log = new DisposeLog();
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, () => new AsyncDisposableThing('A', log), [[]], 'singleton');
    services = services.addFactory(T.B, () => new AsyncDisposableThing('B', log), [[]], 'singleton');

    const root = services.build().createScope('singleton');
    root.resolve(T.A);
    root.resolve(T.B);
    await root.disposeAsync();

    expect(log.order).toEqual(['B', 'A']);
  });

  test('disposeAsync honors both Symbol.dispose and Symbol.asyncDispose', async () => {
    const log = new DisposeLog();
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, () => new SyncDisposable('sync', log), [[]], 'singleton');
    services = services.addFactory(T.B, () => new AsyncDisposableThing('async', log), [[]], 'singleton');

    const root = services.build().createScope('singleton');
    root.resolve(T.A);
    root.resolve(T.B);
    await root.disposeAsync();

    // Reverse order, mixed disposers both fire.
    expect(log.order).toEqual(['async', 'sync']);
  });

  test('disposeAsync awaits Promise-valued instances before disposing them', async () => {
    const log = new DisposeLog();
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, async () => new AsyncDisposableThing('resolved', log), [[]], 'singleton');

    const root = services.build().createScope('singleton');
    root.resolve<Promise<AsyncDisposableThing>>(T.A);
    await root.disposeAsync();

    // The Promise was awaited, then the settled disposable was disposed.
    expect(log.order).toEqual(['resolved']);
  });
});

describe('sync dispose with a Promise-valued instance', () => {
  test('throws AsyncDisposalRequiredError directing to disposeAsync', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, async () => ({ ok: true }), [[]], 'singleton');

    const root = services.build().createScope('singleton');
    root.resolve(T.A); // caches a Promise

    expect(() => root.dispose()).toThrow(AsyncDisposalRequiredError);
    try {
      root.dispose();
    } catch (err) {
      expect((err as Error).message).toContain('disposeAsync');
    }
  });

  test('after the throw, disposeAsync still cleans up correctly', async () => {
    const log = new DisposeLog();
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, async () => new AsyncDisposableThing('late', log), [[]], 'singleton');

    const root = services.build().createScope('singleton');
    root.resolve(T.A);
    expect(() => root.dispose()).toThrow(AsyncDisposalRequiredError);

    // dispose() threw before flipping the disposed flag, so disposeAsync still
    // runs the teardown.
    await root.disposeAsync();
    expect(log.order).toEqual(['late']);
  });
});

describe('disposal failure aggregation', () => {
  // Mirrors the reference scope-disposal policy: a throwing disposable never
  // aborts its siblings' teardown; ONE collected failure rethrows as itself,
  // several aggregate into one AggregateError.

  /** A native `Disposable` that logs, then throws. */
  class ThrowingDisposable implements Disposable {
    public constructor(
      public readonly label: string,
      private readonly log: DisposeLog,
      private readonly err: Error,
    ) {}
    public [Symbol.dispose](): void {
      this.log.order.push(this.label);
      throw this.err;
    }
  }

  /** A native `AsyncDisposable` that logs, then rejects. */
  class ThrowingAsyncDisposable implements AsyncDisposable {
    public constructor(
      public readonly label: string,
      private readonly log: DisposeLog,
      private readonly err: Error,
    ) {}
    public async [Symbol.asyncDispose](): Promise<void> {
      await Promise.resolve();
      this.log.order.push(this.label);
      throw this.err;
    }
  }

  test('sync: a throwing disposable does not abort its siblings; a single failure rethrows as itself', () => {
    const log = new DisposeLog();
    const boom = new Error('boom-B');
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, () => new SyncDisposable('A', log), [[]], 'singleton');
    services = services.addFactory(T.B, () => new ThrowingDisposable('B', log, boom), [[]], 'singleton');
    services = services.addFactory(T.C, () => new SyncDisposable('C', log), [[]], 'singleton');

    const root = services.build().createScope('singleton');
    root.resolve(T.A);
    root.resolve(T.B);
    root.resolve(T.C);

    let caught: unknown;
    try {
      root.dispose();
    } catch (err) {
      caught = err;
    }
    // The single failure surfaces as the ORIGINAL error, not an aggregate...
    expect(caught).toBe(boom);
    // ...and every sibling was still disposed, in reverse order.
    expect(log.order).toEqual(['C', 'B', 'A']);
  });

  test('sync: two failures aggregate into one AggregateError, in disposal order', () => {
    const log = new DisposeLog();
    const boomB = new Error('boom-B');
    const boomC = new Error('boom-C');
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, () => new SyncDisposable('A', log), [[]], 'singleton');
    services = services.addFactory(T.B, () => new ThrowingDisposable('B', log, boomB), [[]], 'singleton');
    services = services.addFactory(T.C, () => new ThrowingDisposable('C', log, boomC), [[]], 'singleton');

    const root = services.build().createScope('singleton');
    root.resolve(T.A);
    root.resolve(T.B);
    root.resolve(T.C);

    let caught: unknown;
    try {
      root.dispose();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    // Reverse construction order: C disposed (and failed) first.
    expect((caught as AggregateError).errors).toEqual([boomC, boomB]);
    expect(log.order).toEqual(['C', 'B', 'A']);
  });

  test('sync: the provider is disposed despite the failure — a second dispose is a no-op', () => {
    const log = new DisposeLog();
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, () => new ThrowingDisposable('A', log, new Error('boom')), [[]], 'singleton');

    const root = services.build().createScope('singleton');
    root.resolve(T.A);
    expect(() => root.dispose()).toThrow('boom');
    root.dispose(); // idempotent — nothing rethrown, nothing re-disposed
    expect(log.order).toEqual(['A']);
  });

  test('async: a rejecting asyncDispose does not abort its siblings; failures aggregate', async () => {
    const log = new DisposeLog();
    const boomA = new Error('boom-A');
    const boomC = new Error('boom-C');
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, () => new ThrowingAsyncDisposable('A', log, boomA), [[]], 'singleton');
    services = services.addFactory(T.B, () => new AsyncDisposableThing('B', log), [[]], 'singleton');
    services = services.addFactory(T.C, () => new ThrowingDisposable('C', log, boomC), [[]], 'singleton');

    const root = services.build().createScope('singleton');
    root.resolve(T.A);
    root.resolve(T.B);
    root.resolve(T.C);

    let caught: unknown;
    try {
      await root.disposeAsync();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).errors).toEqual([boomC, boomA]);
    expect(log.order).toEqual(['C', 'B', 'A']);
  });

  test('async: a single failure rejects with the original error', async () => {
    const log = new DisposeLog();
    const boom = new Error('boom-only');
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, () => new AsyncDisposableThing('A', log), [[]], 'singleton');
    services = services.addFactory(T.B, () => new ThrowingAsyncDisposable('B', log, boom), [[]], 'singleton');

    const root = services.build().createScope('singleton');
    root.resolve(T.A);
    root.resolve(T.B);

    let caught: unknown;
    try {
      await root.disposeAsync();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBe(boom);
    expect(log.order).toEqual(['B', 'A']);
  });
});

describe('native using / await using', () => {
  test('using calls Symbol.dispose on block exit', () => {
    const log = new DisposeLog();
    let services = new ServiceManifest<'singleton'>();
    services = services.addFactory(T.A, () => new SyncDisposable('scoped', log), [[]], 'singleton');
    const root = services.build();

    {
      using child = root.createScope('singleton');
      // resolve on the child's own scope so it owns the instance.
      child.resolve(T.A);
      expect(log.order).toEqual([]);
    }
    // child disposed on block exit.
    expect(log.order).toEqual(['scoped']);
  });

  test('await using calls Symbol.asyncDispose on block exit', async () => {
    const log = new DisposeLog();
    let services = new ServiceManifest<'singleton' | 'request'>();
    services = services.addFactory(T.A, () => new AsyncDisposableThing('req', log), [[]], 'request');
    const root = services.build();

    {
      await using req = root.createScope('request');
      req.resolve(T.A);
      expect(log.order).toEqual([]);
    }
    expect(log.order).toEqual(['req']);
  });
});
