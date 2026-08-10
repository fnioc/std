// Behaviour tests for how the engine settles a union dependency. A union states which types will
// do, not an order to prefer them in, so exactly one member may answer it -- and a member that
// supplies itself is the fallback rather than a competitor.

import { ServiceProvider } from '@rhombus-std/di2';
import { AmbiguousUnionError, CycleError, DefaultManifest, ManifestValidationError,
  ServiceDescriptor } from '@rhombus-std/di2.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

const CACHE = Type.named('Cache', 'app');
const REDIS = Type.named('Redis', 'app');
const REPORT = Type.named('Report', 'app');
const LOOP = Type.named('Loop', 'app');

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
    .add(ServiceDescriptor.ctor(REPORT, Report, [[Type.union(CACHE, REDIS)]]));
  for (const cache of caches) {
    manifest = cache === 'memory'
      ? manifest.add(ServiceDescriptor.ctor(CACHE, MemoryCache, [[]]))
      : manifest.add(ServiceDescriptor.ctor(REDIS, RedisCache, [[]]));
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
  test('raise, naming the members that compete', () => {
    const provider = new ServiceProvider(manifestWith('memory', 'redis'));
    expect(() => provider.resolve(REPORT)).toThrow(AmbiguousUnionError);
    try {
      provider.resolve(REPORT);
    } catch (error) {
      expect(error).toBeInstanceOf(AmbiguousUnionError);
      expect((error as AmbiguousUnionError).members).toEqual([CACHE, REDIS]);
      expect((error as AmbiguousUnionError).message).toContain('app:Cache');
      expect((error as AmbiguousUnionError).message).toContain('app:Redis');
    }
  });

  test('are caught at build when the provider validates up front', () => {
    expect(() => new ServiceProvider(manifestWith('memory', 'redis'), { validateOnBuild: true }))
      .toThrow(ManifestValidationError);
  });

  test('settle on the newest registration when asked to', () => {
    const provider = new ServiceProvider(manifestWith('memory', 'redis'), { unionAmbiguity: 'newest' });
    const report = provider.resolve(REPORT) as Report;
    expect(report.cache).toBeInstanceOf(RedisCache);
  });
});

describe('a self-supplying member is the fallback', () => {
  const OPTIONAL = Type.union(CACHE, Type.typeLiteral(undefined));

  function optionalManifest(registerCache: boolean) {
    const manifest = DefaultManifest.empty<string>()
      .add(ServiceDescriptor.ctor(REPORT, Report, [[OPTIONAL]]));
    return registerCache ? manifest.add(ServiceDescriptor.ctor(CACHE, MemoryCache, [[]])) : manifest;
  }

  test('yields the service when one is registered', () => {
    const report = new ServiceProvider(optionalManifest(true)).resolve(REPORT) as Report;
    expect(report.cache).toBeInstanceOf(MemoryCache);
  });

  test('yields the literal when none is', () => {
    const report = new ServiceProvider(optionalManifest(false)).resolve(REPORT) as Report;
    expect(report.cache).toBeUndefined();
  });

  test('never competes, so it cannot make a union ambiguous', () => {
    const report = new ServiceProvider(optionalManifest(true), { validateOnBuild: true })
      .resolve(REPORT) as Report;
    expect(report.cache).toBeInstanceOf(MemoryCache);
  });
});

describe('the cycle guard', () => {
  test('still closes a loop after the move to identity comparison', () => {
    const manifest = DefaultManifest.empty<string>().add(ServiceDescriptor.ctor(LOOP, Loop, [[LOOP]]));
    expect(() => new ServiceProvider(manifest).resolve(LOOP)).toThrow(CycleError);
  });
});
