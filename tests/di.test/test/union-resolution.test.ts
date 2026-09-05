// Behaviour tests for how the engine settles a union dependency: a registration for the union
// itself answers ahead of everything else, and otherwise each member is tried
// registration-then-synthesis in one pass, in canonical order, so the first resolvable member
// wins. Literals order last among members, which is what keeps a literal member as the fallback
// of an optional dependency.

import { Builder } from '@rhombus-std/di';
import { CycleError, Manifest, Registration, UnsatisfiableError } from '@rhombus-std/di.core';
import { Type } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

/** Seals `manifest` into a provider with no lifetime model: the lifetime each registration names is filed, never read. */
function toProvider(manifest: Manifest<string>) {
  return Builder.withServices(() => manifest).build();
}

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
  let manifest = Manifest.empty<string>()
    .add(Registration.ctor(REPORT, Report, Type.ctor(REPORT, [[Type.union(CACHE, REDIS)]]), 'singleton'));
  for (const cache of caches) {
    manifest = cache === 'memory'
      ? manifest.add(Registration.ctor(CACHE, MemoryCache, Type.ctor(CACHE, [[]]), 'singleton'))
      : manifest.add(Registration.ctor(REDIS, RedisCache, Type.ctor(REDIS, [[]]), 'singleton'));
  }
  return manifest;
}

describe('one suppliable member', () => {
  test('answers the union', () => {
    const report = toProvider(manifestWith('memory')).resolve(REPORT) as Report;
    expect(report.cache).toBeInstanceOf(MemoryCache);
  });

  test('answers it whichever way the union was spelled', () => {
    // The two spellings are one interned object, so the engine cannot see a difference.
    expect(Type.union(REDIS, CACHE)).toBe(Type.union(CACHE, REDIS));
    const report = toProvider(manifestWith('redis')).resolve(REPORT) as Report;
    expect(report.cache).toBeInstanceOf(RedisCache);
  });
});

describe('several suppliable members', () => {
  test('settle on the first in canonical member order, whichever was registered first', () => {
    // app:Cache orders before app:Redis, so the registration order cannot show through.
    const memoryFirst = toProvider(manifestWith('memory', 'redis')).resolve(REPORT) as Report;
    expect(memoryFirst.cache).toBeInstanceOf(MemoryCache);
    const redisFirst = toProvider(manifestWith('redis', 'memory')).resolve(REPORT) as Report;
    expect(redisFirst.cache).toBeInstanceOf(MemoryCache);
  });
});

describe('a self-supplying member is the fallback', () => {
  const OPTIONAL = Type.union(CACHE, Type.typeLiteral(undefined));

  function optionalManifest(registerCache: boolean) {
    const manifest = Manifest.empty<string>()
      .add(Registration.ctor(REPORT, Report, Type.ctor(REPORT, [[OPTIONAL]]), 'singleton'));
    return registerCache ? manifest.add(Registration.ctor(CACHE, MemoryCache, Type.ctor(CACHE, [[]]), 'singleton')) : manifest;
  }

  test('yields the service when one is registered', () => {
    const report = toProvider(optionalManifest(true)).resolve(REPORT) as Report;
    expect(report.cache).toBeInstanceOf(MemoryCache);
  });

  test('yields the literal when none is', () => {
    const report = toProvider(optionalManifest(false)).resolve(REPORT) as Report;
    expect(report.cache).toBeUndefined();
  });

  test('a registered literal member wins the registration phase like any other', () => {
    const manifest = optionalManifest(false)
      .add(Registration.value(Type.typeLiteral(undefined), 'registered-for-undefined'));
    const report = toProvider(manifest).resolve(REPORT) as Report;
    expect(report.cache).toBe('registered-for-undefined');
  });
});

describe('a union-typed registration', () => {
  const EITHER = Type.union(CACHE, REDIS);

  test('serves the exact union request', () => {
    const manifest = Manifest.empty<string>().addValue(EITHER, 'either');
    expect(toProvider(manifest).resolve(EITHER)).toBe('either');
  });

  test('cannot serve a lone member — the union says which types will do, not what it holds', () => {
    const provider = toProvider(Manifest.empty<string>().addValue(EITHER, 'either'));
    expect(() => provider.resolve(CACHE)).toThrow(UnsatisfiableError);
    expect(() => provider.resolve(CACHE)).toThrow(UnsatisfiableError);
  });
});

describe('the cycle guard', () => {
  test('a slot naming its own address resolves beneath, and with nothing older it is unsatisfiable, not a cycle', () => {
    const manifest = Manifest.empty<string>().add(Registration.ctor(LOOP, Loop, Type.ctor(LOOP, [[LOOP]]), 'singleton'));
    const ask = () => toProvider(manifest).resolve(LOOP);
    expect(ask).toThrow(UnsatisfiableError);
    expect(ask).not.toThrow(CycleError);
  });

  test('a loop closed through a union member on a second address is still a cycle', () => {
    // Report wants `Cache | Loop`; nothing registers Cache, so the Loop member is tried, and Loop
    // wants Report again.
    const manifest = Manifest.empty<string>()
      .add(Registration.ctor(REPORT, Report, Type.ctor(REPORT, [[Type.union(CACHE, LOOP)]]), 'singleton'))
      .add(Registration.ctor(LOOP, Loop, Type.ctor(LOOP, [[REPORT]]), 'singleton'));
    expect(() => toProvider(manifest).resolve(REPORT)).toThrow(CycleError);
  });
});
