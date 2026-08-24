// Behaviour tests for how the engine settles a union dependency: two phases over the members in
// canonical order -- first the members' own registrations, then the members' syntheses -- with a
// registration for the union itself answering ahead of both. Literals order last among members,
// which is what keeps a literal member as the fallback of an optional dependency.

import { ServiceProvider } from '@rhombus-std/di';
import { CycleError, DefaultManifest, ServiceDescriptor, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const CACHE = Type.imported('Cache', 'app');
const REDIS = Type.imported('Redis', 'app');
const REPORT = Type.imported('Report', 'app');
const LOOP = Type.imported('Loop', 'app');

class MemoryCache {}
class RedisCache {}
class Report {
  constructor(readonly cache: unknown) {}
}
class Loop {
  constructor(readonly self: unknown) {}
}

/** A manifest registering `Report` over `Cache | Redis`, plus whichever caches are named. */
function manifestWith(...caches: readonly ('memory' | 'redis')[]) {
  let manifest = DefaultManifest.empty<string>()
    .add(ServiceDescriptor.ctor(REPORT, Report, Type.ctor(REPORT, [[Type.union(CACHE, REDIS)]])));
  for (const cache of caches) {
    manifest = cache === 'memory'
      ? manifest.add(ServiceDescriptor.ctor(CACHE, MemoryCache, Type.ctor(CACHE, [[]])))
      : manifest.add(ServiceDescriptor.ctor(REDIS, RedisCache, Type.ctor(REDIS, [[]])));
  }
  return manifest;
}

describe('one suppliable member', () => {
  test('answers the union', () => {
    const report = new ServiceProvider(manifestWith('memory')).resolve(REPORT) as Report;
    expect(report.cache).toBeInstanceOf(MemoryCache);
  });

  test('answers it whichever way the union was spelled', () => {
    // The two spellings are one interned object, so the engine cannot see a difference.
    expect(Type.union(REDIS, CACHE)).toBe(Type.union(CACHE, REDIS));
    const report = new ServiceProvider(manifestWith('redis')).resolve(REPORT) as Report;
    expect(report.cache).toBeInstanceOf(RedisCache);
  });
});

describe('several suppliable members', () => {
  test('settle on the first in canonical member order, whichever was registered first', () => {
    // app:Cache orders before app:Redis, so the registration order cannot show through.
    const memoryFirst = new ServiceProvider(manifestWith('memory', 'redis')).resolve(REPORT) as Report;
    expect(memoryFirst.cache).toBeInstanceOf(MemoryCache);
    const redisFirst = new ServiceProvider(manifestWith('redis', 'memory')).resolve(REPORT) as Report;
    expect(redisFirst.cache).toBeInstanceOf(MemoryCache);
  });
});

describe('a self-supplying member is the fallback', () => {
  const OPTIONAL = Type.union(CACHE, Type.typeLiteral(undefined));

  function optionalManifest(registerCache: boolean) {
    const manifest = DefaultManifest.empty<string>()
      .add(ServiceDescriptor.ctor(REPORT, Report, Type.ctor(REPORT, [[OPTIONAL]])));
    return registerCache ? manifest.add(ServiceDescriptor.ctor(CACHE, MemoryCache, Type.ctor(CACHE, [[]]))) : manifest;
  }

  test('yields the service when one is registered', () => {
    const report = new ServiceProvider(optionalManifest(true)).resolve(REPORT) as Report;
    expect(report.cache).toBeInstanceOf(MemoryCache);
  });

  test('yields the literal when none is', () => {
    const report = new ServiceProvider(optionalManifest(false)).resolve(REPORT) as Report;
    expect(report.cache).toBeUndefined();
  });

  test('a registered literal member wins the registration phase like any other', () => {
    const manifest = optionalManifest(false)
      .add(ServiceDescriptor.value(Type.typeLiteral(undefined), 'registered-for-undefined'));
    const report = new ServiceProvider(manifest).resolve(REPORT) as Report;
    expect(report.cache).toBe('registered-for-undefined');
  });
});

describe('a union-typed registration', () => {
  const EITHER = Type.union(CACHE, REDIS);

  test('serves the exact union request', () => {
    const manifest = DefaultManifest.empty<string>().addValue(EITHER, 'either');
    expect(new ServiceProvider(manifest).getService(EITHER)).toBe('either');
  });

  test('cannot serve a lone member — the union says which types will do, not what it holds', () => {
    const provider = new ServiceProvider(DefaultManifest.empty<string>().addValue(EITHER, 'either'));
    expect(() => provider.resolve(CACHE)).toThrow(UnsatisfiableError);
    expect(() => provider.getService(CACHE)).toThrow(UnsatisfiableError);
  });
});

describe('the cycle guard', () => {
  test('still closes a loop after the move to identity comparison', () => {
    const manifest = DefaultManifest.empty<string>().add(ServiceDescriptor.ctor(LOOP, Loop, Type.ctor(LOOP, [[LOOP]])));
    expect(() => new ServiceProvider(manifest).resolve(LOOP)).toThrow(CycleError);
  });
});
