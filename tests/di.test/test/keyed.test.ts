import { ServiceManifest } from '@rhombus-std/di';
import type { Token } from '@rhombus-std/di.core';
import { describe, expect, test } from 'bun:test';

// Keyed services (foundation). A key is NOT a parallel resolution subsystem —
// service identity is already a token string, so a key is just a `"#<key>"`
// suffix on the base token: `caching.core:ICache#redis`. A `#`-suffixed token
// is an ORDINARY token, so keyed registration is `addClass("base#key", Impl)` and
// exact keyed resolution is the existing O(1) lookup.
//
//   - SINGULAR resolve: `resolve(base, key)` composes `key === "" ? base :
//     base + "#" + key` and runs the exact lookup. `key` defaults to `""` (the
//     bare, non-keyed token), so every existing single-arg call is unaffected.
//   - PLURAL resolve: `resolve(base, /re/)` scans base's key-space, testing the
//     KEY PORTION (the substring after `#`, or `""` for the bare token) against
//     the regex, returning matches in registration order as an array.
//
// All hand-written tokens (no transformer) — the engine only ever sees strings.

const CACHE: Token = 'caching.core:ICache';
const CACHE_REDIS: Token = 'caching.core:ICache#redis';
const CACHE_MEMORY: Token = 'caching.core:ICache#memory';

class RedisCache {
  public readonly kind = 'redis';
}

class MemoryCache {
  public readonly kind = 'memory';
}

class BareCache {
  public readonly kind = 'bare';
}

describe('keyed singular resolution', () => {
  test('resolves a keyed registration via the pre-composed token', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');

    const cache = services.build().resolve<RedisCache>(CACHE_REDIS);

    expect(cache).toBeInstanceOf(RedisCache);
    expect(cache.kind).toBe('redis');
  });

  test('resolves a keyed registration via the two-arg (base, key) form', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');

    const cache = services.build().resolve<RedisCache>(CACHE, 'redis');

    expect(cache).toBeInstanceOf(RedisCache);
    expect(cache.kind).toBe('redis');
  });

  test('the two-arg form equals the pre-composed token exactly', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');

    // Open the singleton frame so the tag caches — same instance proves both
    // spellings compute the identical lookup token.
    const root = services.build().createScope('singleton');
    expect(root.resolve<RedisCache>(CACHE, 'redis')).toBe(
      root.resolve<RedisCache>(CACHE_REDIS),
    );
  });

  test('the empty-key default resolves the BARE non-keyed token', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE, BareCache, [[]], 'singleton');

    const root = services.build().createScope('singleton');
    // `resolve(base, '')` and `resolve(base)` are the same bare lookup.
    expect(root.resolve<BareCache>(CACHE, '')).toBe(root.resolve<BareCache>(CACHE));
    expect(root.resolve<BareCache>(CACHE, '').kind).toBe('bare');
  });

  test('a keyed token and its bare base are DISTINCT registrations', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE, BareCache, [[]], 'singleton');
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');

    const root = services.build();
    expect(root.resolve<BareCache>(CACHE).kind).toBe('bare');
    expect(root.resolve<RedisCache>(CACHE, 'redis').kind).toBe('redis');
  });
});

describe('keyed singular tryResolve', () => {
  test('resolves a present keyed token, undefined for a missing key', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');

    const root = services.build();
    expect(root.tryResolve<RedisCache>(CACHE, 'redis')).toBeInstanceOf(RedisCache);
    expect(root.tryResolve<MemoryCache>(CACHE, 'memory')).toBeUndefined();
  });

  test('a bare base registration is NOT found under a key', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE, BareCache, [[]], 'singleton');

    const root = services.build();
    expect(root.tryResolve<BareCache>(CACHE)).toBeInstanceOf(BareCache);
    expect(root.tryResolve<BareCache>(CACHE, 'redis')).toBeUndefined();
  });
});

describe('keyed plural resolution', () => {
  test('/.+/ matches every NON-EMPTY key, excluding the bare token', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');
    services = services.addClass(CACHE_MEMORY, MemoryCache, [[]], 'singleton');
    services = services.addClass(CACHE, BareCache, [[]], 'singleton');

    const all = services.build().resolve<object>(CACHE, /.+/);
    const kinds = all.map((c) => (c as { kind: string; }).kind);
    // Registration order: redis, memory registered before the bare token.
    expect(kinds).toEqual(['redis', 'memory']);
  });

  test('/.*/ matches EVERYTHING including the bare non-keyed token', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');
    services = services.addClass(CACHE, BareCache, [[]], 'singleton');
    services = services.addClass(CACHE_MEMORY, MemoryCache, [[]], 'singleton');

    const all = services.build().resolve<object>(CACHE, /.*/);
    const kinds = all.map((c) => (c as { kind: string; }).kind);
    // Registration order = map insertion order: redis, bare, memory.
    expect(kinds).toEqual(['redis', 'bare', 'memory']);
  });

  test('a specific /pattern/ matches only the keys it names', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');
    services = services.addClass(CACHE_MEMORY, MemoryCache, [[]], 'singleton');
    services = services.addClass(CACHE, BareCache, [[]], 'singleton');

    const all = services.build().resolve<object>(CACHE, /^redis$/);
    const kinds = all.map((c) => (c as { kind: string; }).kind);
    expect(kinds).toEqual(['redis']);
  });

  test('0 matches yields [] — never a throw', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');

    const root = services.build();
    expect(root.resolve<object>(CACHE, /nope/)).toEqual([]);
    // No registrations at all under the base — still empty, no throw.
    expect(root.resolve<object>('pkg:IUnregistered', /.*/)).toEqual([]);
  });

  test('plural elements honor their OWN registration lifetime', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');
    // Transient has no scope tag at all — untagged IS transient.
    services = services.addClass(CACHE_MEMORY, MemoryCache, [[]]);

    const root = services.build().createScope('singleton');
    // Singleton keyed element is cached; transient keyed element is fresh.
    expect(root.resolve<RedisCache>(CACHE, 'redis')).toBe(
      root.resolve<RedisCache>(CACHE, 'redis'),
    );
    expect(root.resolve<MemoryCache>(CACHE, 'memory')).not.toBe(
      root.resolve<MemoryCache>(CACHE, 'memory'),
    );
  });

  test('a specific base is FIXED — a keyed scan never wanders to another type', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');
    // A different base that shares a textual prefix must NOT be swept in.
    services = services.addClass('caching.core:ICacheOther#x', MemoryCache, [[]], 'singleton');

    const all = services.build().resolve<object>(CACHE, /.*/);
    const kinds = all.map((c) => (c as { kind: string; }).kind);
    expect(kinds).toEqual(['redis']);
  });

  test('tryResolve plural mirrors resolve plural (0 matches → [])', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');

    const root = services.build();
    const kinds = root.tryResolve<object>(CACHE, /.+/).map((c) => (c as { kind: string; }).kind);
    expect(kinds).toEqual(['redis']);
    expect(root.tryResolve<object>(CACHE, /nope/)).toEqual([]);
  });
});

describe('keyed / collection isolation', () => {
  const ARRAY: Token = 'Array<caching.core:ICache>';
  const ITERABLE: Token = 'Iterable<caching.core:ICache>';

  test('a keyed registration does NOT leak into Array<base>', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE, BareCache, [[]], 'singleton');
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');
    services = services.addClass(CACHE_MEMORY, MemoryCache, [[]], 'singleton');

    const array = services.build().resolve<object[]>(ARRAY);
    const kinds = array.map((c) => (c as { kind: string; }).kind);
    // ONLY the bare-token registration — no `redis`, no `memory`.
    expect(kinds).toEqual(['bare']);
  });

  test('a keyed registration does NOT leak into Iterable<base>', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE, BareCache, [[]], 'singleton');
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');

    const iterable = services.build().resolve<Iterable<object>>(ITERABLE);
    const kinds = [...iterable].map((c) => (c as { kind: string; }).kind);
    expect(kinds).toEqual(['bare']);
  });

  test('Array<base> with ONLY keyed registrations (no bare) is empty', () => {
    let services = new ServiceManifest<'singleton'>();
    services = services.addClass(CACHE_REDIS, RedisCache, [[]], 'singleton');
    services = services.addClass(CACHE_MEMORY, MemoryCache, [[]], 'singleton');

    // No bare `caching.core:ICache` registration — the collection aggregates
    // only bare-token registrations, so it is empty.
    expect(services.build().resolve<object[]>(ARRAY)).toEqual([]);
  });
});
