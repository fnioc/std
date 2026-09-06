// Behaviour tests for the ask surface on `IServiceProvider`: the collection, async and callable
// shapes each verb spells on the caller's behalf, and the `try` twins, which ask for that same
// shape beside the `undefined` literal. Every verb here composes an address and hands it to
// one `getService`, so what each answers is the engine's reading of the address it built.

import { Builder } from '@rhombus-std/di';
import { Manifest, Registration, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

/** Seals `manifest` into a provider with no lifetime model: every ask constructs afresh. */
function toProvider(manifest: Manifest<string>) {
  return Builder.withServices(() => manifest).build();
}

const SINK = Type.imported('Sink', 'app');
const MISSING = Type.imported('Missing', 'app');
const CONN = Type.imported('Conn', 'app');
const WIDGET = Type.imported('Widget', 'app');
const CLOCK = Type.imported('Clock', 'app');

class Clock {}
class ManifestConn {}
class CallConn {}
class Widget {
  constructor(readonly conn: unknown) {}
}

/** Two registrations of one address, so every collection shape has more than one element to walk. */
const sinks = Manifest.empty<string>()
  .add(Registration.value(SINK, 'first'))
  .add(Registration.value(SINK, 'second'));

/** `Widget(Conn)` with a Conn of its own, so the manifest alone already answers `Widget`. */
const widgets = Manifest.empty<string>()
  .add(Registration.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CONN]]), 'singleton'))
  .add(Registration.ctor(CONN, ManifestConn, Type.ctor(CONN, [[]]), 'singleton'));

describe('the single value', () => {
  test('resolve answers the registration and throws when there is none', () => {
    const provider = toProvider(sinks);
    expect(provider.resolve(SINK)).toBe('second');
    expect(() => provider.resolve(MISSING)).toThrow(UnsatisfiableError);
  });

  test('tryResolve answers the same registration, and undefined instead of throwing', () => {
    const provider = toProvider(sinks);
    expect(provider.tryResolve(SINK)).toBe('second');
    expect(provider.tryResolve(MISSING)).toBeUndefined();
  });

  test('resolveAsync settles on the value; tryResolveAsync settles on undefined', async () => {
    const provider = toProvider(sinks);
    await expect(provider.resolveAsync(SINK)).resolves.toBe('second');
    await expect(provider.tryResolveAsync(MISSING)).resolves.toBeUndefined();
  });

  test('resolveAsync unwraps a promise registration the plain ask hands over pending', async () => {
    const provider = toProvider(Manifest.empty<string>().addValue(Type.promise(CLOCK), Promise.resolve(new Clock())));
    expect(provider.resolve(Type.promise(CLOCK))).toBeInstanceOf(Promise);
    await expect(provider.resolveAsync(CLOCK)).resolves.toBeInstanceOf(Clock);
  });
});

describe('the collection shapes', () => {
  test('resolveArray is a snapshot of every registration', () => {
    expect(toProvider(sinks).resolveArray(SINK)).toEqual(['first', 'second']);
  });

  test('resolveIterable walks the same elements as the iterable address names', () => {
    const provider = toProvider(sinks);
    expect([...provider.resolveIterable(SINK)]).toEqual([...provider.resolve(Type.iterable(SINK)) as Iterable<string>]);
  });

  test('resolveAsyncIterable yields the same elements, one step at a time', async () => {
    const seen: unknown[] = [];
    for await (const sink of toProvider(sinks).resolveAsyncIterable(SINK)) {
      seen.push(sink);
    }
    expect(seen).toEqual(['first', 'second']);
  });

  test('resolveArrayAsync and resolveIterableAsync settle on the same elements', async () => {
    const provider = toProvider(sinks);
    await expect(provider.resolveArrayAsync(SINK)).resolves.toEqual(['first', 'second']);
    expect([...await provider.resolveIterableAsync(SINK)]).toEqual(['first', 'second']);
  });

  test('an unregistered element type aggregates to an empty collection rather than an absence', () => {
    const provider = toProvider(sinks);
    expect(provider.resolveArray(MISSING)).toEqual([]);
    expect([...provider.resolveIterable(MISSING)]).toEqual([]);
  });
});

describe('calling a registered callable', () => {
  test('a resolved callable threads the call arguments through to the construction', () => {
    const passed = new CallConn();
    const make = toProvider(widgets).resolve(Type.func(WIDGET, [[CONN]])) as (conn: CallConn) => Widget;
    expect(make(passed).conn).toBe(passed);
  });

  test('the same callable resolved through the try twin reaches the same construction', () => {
    const passed = new CallConn();
    const make = toProvider(widgets).tryResolve(Type.func(WIDGET, [[CONN]])) as (conn: CallConn) => Widget;
    expect(make(passed).conn).toBe(passed);
  });

  test('a promise-returning callable settles on what the construction produced', async () => {
    const passed = new CallConn();
    const make = toProvider(widgets).resolve(Type.func(Type.promise(WIDGET), [[CONN]])) as (conn: CallConn) => Promise<Widget>;
    await expect(make(passed).then(widget => widget.conn)).resolves.toBe(passed);
  });

  test('a callable whose return nothing can build throws from inside the call, through the try twin as well', () => {
    // The `undefined` member answers an address nothing can PRODUCE; a callable address is always
    // produceable, so the broken graph surfaces from inside the call either way.
    const provider = toProvider(widgets);
    const make = provider.resolve(Type.func(MISSING, [[]])) as () => unknown;
    const tried = provider.tryResolve(Type.func(MISSING, [[]])) as () => unknown;
    expect(() => make()).toThrow(UnsatisfiableError);
    expect(() => tried()).toThrow(UnsatisfiableError);
  });
});

describe('building what the caller already holds', () => {
  class Report {
    constructor(readonly clock: unknown) {}
  }

  const clocks = Manifest.empty<string>().add(Registration.ctor(CLOCK, Clock, Type.ctor(CLOCK, [[]]), 'singleton'));

  test('instantiate constructs the class fresh, its dependencies filled from the manifest', () => {
    const provider = toProvider(clocks);
    const report = provider.instantiate(Type.ctor(MISSING, [[CLOCK]]), Report);
    expect(report.clock).toBeInstanceOf(Clock);
    expect(provider.instantiate(Type.ctor(MISSING, [[CLOCK]]), Report)).not.toBe(report);
  });

  test('invoke calls the function the same way', () => {
    const describeClock = (clock: unknown) => `saw ${(clock as object).constructor.name}`;
    expect(toProvider(clocks).invoke(Type.func(MISSING, [[CLOCK]]), describeClock)).toBe('saw Clock');
  });

  test('tryInstantiate and tryInvoke reach the same doors', () => {
    const provider = toProvider(clocks);
    const describeClock = (clock: unknown) => `saw ${(clock as object).constructor.name}`;
    expect(provider.tryInstantiate(Type.ctor(MISSING, [[CLOCK]]), Report)!.clock).toBeInstanceOf(Clock);
    expect(provider.tryInvoke(Type.func(MISSING, [[CLOCK]]), describeClock)).toBe('saw Clock');
  });

  test('a dependency nothing registers throws rather than arriving undefined', () => {
    const provider = toProvider(Manifest.empty<string>());
    expect(() => provider.instantiate(Type.ctor(MISSING, [[CLOCK]]), Report)).toThrow(UnsatisfiableError);
    expect(() => provider.tryInstantiate(Type.ctor(MISSING, [[CLOCK]]), Report)).toThrow(UnsatisfiableError);
  });
});
