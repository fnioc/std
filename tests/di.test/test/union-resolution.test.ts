// Behaviour tests for how the engine settles a union dependency. A union states which types will
// do, not an order to prefer them in, so exactly one member may answer it -- and a member that
// supplies itself is the fallback rather than a competitor.

import { ServiceProvider } from '@rhombus-std/di';
import { AmbiguousUnionError, ConstantType, CycleError, DefaultManifest, ManifestValidationError,
  ServiceDescriptor } from '@rhombus-std/di.core';
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
    const report = new ServiceProvider(manifestWith('memory')).getService(REPORT) as Report;
    expect(report.cache).toBeInstanceOf(MemoryCache);
  });

  test('answers it whichever way the union was spelled', () => {
    // The two spellings are one interned object, so the engine cannot see a difference.
    expect(Type.union(REDIS, CACHE)).toBe(Type.union(CACHE, REDIS));
    const report = new ServiceProvider(manifestWith('redis')).getService(REPORT) as Report;
    expect(report.cache).toBeInstanceOf(RedisCache);
  });
});

describe('several suppliable members', () => {
  test('raise, naming the members that compete', () => {
    const provider = new ServiceProvider(manifestWith('memory', 'redis'));
    expect(() => provider.getService(REPORT)).toThrow(AmbiguousUnionError);
    try {
      provider.getService(REPORT);
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
    const report = provider.getService(REPORT) as Report;
    expect(report.cache).toBeInstanceOf(RedisCache);
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
    const report = new ServiceProvider(optionalManifest(true)).getService(REPORT) as Report;
    expect(report.cache).toBeInstanceOf(MemoryCache);
  });

  test('yields the literal when none is', () => {
    const report = new ServiceProvider(optionalManifest(false)).getService(REPORT) as Report;
    expect(report.cache).toBeUndefined();
  });

  test('never competes, so it cannot make a union ambiguous', () => {
    const report = new ServiceProvider(optionalManifest(true), { validateOnBuild: true })
      .getService(REPORT) as Report;
    expect(report.cache).toBeInstanceOf(MemoryCache);
  });
});

describe('a union-typed registration', () => {
  const EITHER = Type.union(CACHE, REDIS);

  test('serves the exact union request', () => {
    const manifest = DefaultManifest.empty<string>().add(EITHER, 'either', ConstantType);
    expect(new ServiceProvider(manifest).getRequiredService(EITHER)).toBe('either');
  });

  test('cannot serve a lone member — the union says which types will do, not what it holds', () => {
    const provider = new ServiceProvider(DefaultManifest.empty<string>().add(EITHER, 'either', ConstantType));
    expect(provider.getService(CACHE)).toBeUndefined();
    expect(() => provider.getRequiredService(CACHE)).toThrow('nothing is registered for app:Cache.');
  });
});

describe('the cycle guard', () => {
  test('still closes a loop after the move to identity comparison', () => {
    const manifest = DefaultManifest.empty<string>().add(ServiceDescriptor.ctor(LOOP, Loop, Type.ctor(LOOP, [[LOOP]])));
    expect(() => new ServiceProvider(manifest).getService(LOOP)).toThrow(CycleError);
  });
});
