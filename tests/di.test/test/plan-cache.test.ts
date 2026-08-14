// Behaviour tests for which registrations a resolution is planned against. A plan belongs to the
// manifest it was built from; a latebound call resolves against that manifest composed with the
// call's own arguments, which is a different set of registrations and so a different plan.

import { ServiceProvider } from '@rhombus-std/di';
import { AmbiguousUnionError, DefaultManifest, ServiceDescriptor } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

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
const widgets = DefaultManifest.empty<string>()
  .add(ServiceDescriptor.ctor(WIDGET, Widget, Type.ctor(WIDGET, CONN)))
  .add(ServiceDescriptor.ctor(CONN, ManifestConn, Type.ctor(CONN)));

describe('a latebound call resolves against its own registrations', () => {
  test('the call argument outranks the manifest, even after the plain plan is cached', () => {
    const provider = new ServiceProvider(widgets);
    expect((provider.getService(WIDGET) as Widget).conn).toBeInstanceOf(ManifestConn);

    const make = provider.getService(Type.func(WIDGET, CONN)) as (conn: unknown) => Widget;
    const passed = new CallConn();
    expect(make(passed).conn).toBe(passed);
  });

  test('and leaves the manifest plan alone for the next plain resolution', () => {
    const provider = new ServiceProvider(widgets);
    const make = provider.getService(Type.func(WIDGET, CONN)) as (conn: unknown) => Widget;
    make(new CallConn());

    expect((provider.getService(WIDGET) as Widget).conn).toBeInstanceOf(ManifestConn);
  });

  test('each call is planned afresh, so one call never answers the next', () => {
    const make = new ServiceProvider(widgets).getService(Type.func(WIDGET, CONN)) as (conn: unknown) => Widget;
    const first = new CallConn();
    const second = new CallConn();
    expect(make(first).conn).toBe(first);
    expect(make(second).conn).toBe(second);
  });
});

describe('a union is settled against the resolving call', () => {
  // `Report` wants `Cache | Redis`; the manifest supplies only the Cache half.
  const reports = DefaultManifest.empty<string>()
    .add(ServiceDescriptor.ctor(REPORT, Report, Type.ctor(REPORT, Type.union(CACHE, REDIS))))
    .add(ServiceDescriptor.ctor(CACHE, MemoryCache, Type.ctor(CACHE)));

  test('one member answers when the manifest is the whole universe', () => {
    expect((new ServiceProvider(reports).getService(REPORT) as Report).cache).toBeInstanceOf(MemoryCache);
  });

  test('a call argument supplying the other member makes the same union ambiguous', () => {
    const provider = new ServiceProvider(reports);
    expect((provider.getService(REPORT) as Report).cache).toBeInstanceOf(MemoryCache);

    const make = provider.getService(Type.func(REPORT, REDIS)) as (redis: unknown) => Report;
    expect(() => make({})).toThrow(AmbiguousUnionError);
  });
});

describe('a chosen member that fails while being built', () => {
  test('fails the resolution rather than falling through to the next answer', () => {
    class Exploding {
      constructor() {
        throw new Error('boom');
      }
    }
    const manifest = DefaultManifest.empty<string>()
      .add(ServiceDescriptor.ctor(REPORT, Report, Type.ctor(REPORT, Type.union(CACHE, Type.typeLiteral(undefined)))))
      .add(ServiceDescriptor.ctor(CACHE, Exploding, Type.ctor(CACHE)));

    // The literal is the union's fallback for an ABSENT service, never for a broken one.
    expect(() => new ServiceProvider(manifest).getService(REPORT)).toThrow('boom');
  });

  test('fails it again on the next ask, with the plan unchanged', () => {
    let attempts = 0;
    const manifest = DefaultManifest.empty<string>()
      .add(ServiceDescriptor.ctor(WIDGET, Widget, Type.ctor(WIDGET, CONN)))
      .add(ServiceDescriptor.factory(CONN, () => {
        attempts++;
        throw new Error('boom');
      }, Type.func(CONN)));
    const provider = new ServiceProvider(manifest);

    expect(() => provider.getService(WIDGET)).toThrow('boom');
    expect(() => provider.getService(WIDGET)).toThrow('boom');
    expect(attempts).toBe(2);
  });
});
