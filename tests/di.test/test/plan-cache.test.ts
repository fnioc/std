// Behaviour tests for which registrations a resolution is planned against. A plan belongs to the
// manifest it was built from; a latebound call resolves against that manifest composed with the
// call's own arguments, which is a different set of registrations and so a different plan.

import { di, noop } from '@rhombus-std/di';
import { Manifest, Registration } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

/** Seals `manifest` into a provider through the front door, on the noop lifetime model. */
function toProvider(manifest: Manifest<string>) {
  return di.usingLifetimeModel(noop()).configureServices(m => m.add(manifest)).build();
}

const CONN = Type.imported('Conn', 'app');
const WIDGET = Type.imported('Widget', 'app');
const CACHE = Type.imported('Cache', 'app');
const REDIS = Type.imported('Redis', 'app');
const REPORT = Type.imported('Report', 'app');

class ManifestConn {}
class CallConn {}
class MemoryCache {}
class Widget {
  constructor(readonly conn: unknown) {}
}
class Report {
  constructor(readonly cache: unknown) {}
}

/** `Widget(Conn)`, with a Conn of its own — so the manifest alone already answers `Widget`. */
const widgets = Manifest.empty<string>()
  .add(Registration.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CONN]]), 'singleton'))
  .add(Registration.ctor(CONN, ManifestConn, Type.ctor(CONN, [[]]), 'singleton'));

describe('a latebound call resolves against its own registrations', () => {
  test('the call argument outranks the manifest, even after the plain plan is cached', () => {
    const provider = toProvider(widgets);
    expect((provider.resolve(WIDGET) as Widget).conn).toBeInstanceOf(ManifestConn);

    const make = provider.resolve(Type.func(WIDGET, [[CONN]])) as (conn: unknown) => Widget;
    const passed = new CallConn();
    expect(make(passed).conn).toBe(passed);
  });

  test('and leaves the manifest plan alone for the next plain resolution', () => {
    const provider = toProvider(widgets);
    const make = provider.resolve(Type.func(WIDGET, [[CONN]])) as (conn: unknown) => Widget;
    make(new CallConn());

    expect((provider.resolve(WIDGET) as Widget).conn).toBeInstanceOf(ManifestConn);
  });

  test('each call is planned afresh, so one call never answers the next', () => {
    const make = toProvider(widgets).resolve(Type.func(WIDGET, [[CONN]])) as (conn: unknown) => Widget;
    const first = new CallConn();
    const second = new CallConn();
    expect(make(first).conn).toBe(first);
    expect(make(second).conn).toBe(second);
  });
});

describe('a union is settled against the resolving call', () => {
  // `Report` wants `Cache | Redis`; the manifest supplies only the Redis half, so the
  // first member in canonical order — app:Cache — goes unanswered until a call supplies it.
  const reports = Manifest.empty<string>()
    .add(Registration.ctor(REPORT, Report, Type.ctor(REPORT, [[Type.union(CACHE, REDIS)]]), 'singleton'))
    .add(Registration.ctor(REDIS, MemoryCache, Type.ctor(REDIS, [[]]), 'singleton'));

  test('one member answers when the manifest is the whole universe', () => {
    expect((toProvider(reports).resolve(REPORT) as Report).cache).toBeInstanceOf(MemoryCache);
  });

  test('a call argument answering an earlier member outranks it, plan cache and all', () => {
    const provider = toProvider(reports);
    expect((provider.resolve(REPORT) as Report).cache).toBeInstanceOf(MemoryCache);

    const make = provider.resolve(Type.func(REPORT, [[CACHE]])) as (cache: unknown) => Report;
    const passed = { name: 'call-cache' };
    expect(make(passed).cache).toBe(passed);
  });
});

describe('a chosen member that fails while being built', () => {
  test('fails the resolution rather than falling through to the next answer', () => {
    class Exploding {
      constructor() {
        throw new Error('boom');
      }
    }
    const manifest = Manifest.empty<string>()
      .add(
        Registration.ctor(REPORT, Report, Type.ctor(REPORT, [[Type.union(CACHE, Type.typeLiteral(undefined))]]), 'singleton'),
      )
      .add(Registration.ctor(CACHE, Exploding, Type.ctor(CACHE, [[]]), 'singleton'));

    // The literal is the union's fallback for an ABSENT service, never for a broken one.
    expect(() => toProvider(manifest).resolve(REPORT)).toThrow('boom');
  });

  test('fails it again on the next ask, with the plan unchanged', () => {
    let attempts = 0;
    const manifest = Manifest.empty<string>()
      .add(Registration.ctor(WIDGET, Widget, Type.ctor(WIDGET, [[CONN]]), 'singleton'))
      .add(Registration.factory(CONN, () => {
        attempts++;
        throw new Error('boom');
      }, Type.func(CONN, [[]]), 'singleton'));
    const provider = toProvider(manifest);

    expect(() => provider.resolve(WIDGET)).toThrow('boom');
    expect(() => provider.resolve(WIDGET)).toThrow('boom');
    expect(attempts).toBe(2);
  });
});
