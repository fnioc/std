// Linked cache-entry tracking (`MemoryCacheOptions.trackLinkedCacheEntries`,
// the reference TrackLinkedCacheEntries + CacheEntry current/previous chain):
// while an entry is pending (created, not yet disposed), entries committed or
// read within that window propagate their expiration tokens and earlier
// absolute expirations to it. Black-box through the public surface.

import { type IMemoryCache } from '@rhombus-std/caching.core';
import { type ISystemClock, MemoryCache, MemoryCacheOptions } from '@rhombus-std/caching.memory';
import type { IChangeToken } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

/** A manually-advanced clock driving expiration deterministically. */
class FakeClock implements ISystemClock {
  public nowMs = 1_000_000;
  public get utcNow(): Date {
    return new Date(this.nowMs);
  }
}

/** A manually-fired change token (no active callbacks; polled via hasChanged). */
class ManualToken implements IChangeToken {
  public hasChanged = false;
  public readonly activeChangeCallbacks = false;
  public registerChangeCallback(): Disposable {
    return { [Symbol.dispose]: () => {} };
  }
  public fire(): void {
    this.hasChanged = true;
  }
}

function makeCache(track = true): { cache: MemoryCache; clock: FakeClock; } {
  const clock = new FakeClock();
  const options = new MemoryCacheOptions();
  options.clock = clock;
  options.trackLinkedCacheEntries = track;
  return { cache: new MemoryCache(options), clock };
}

describe('linked cache-entry tracking', () => {
  test('a child committed inside a pending parent propagates its expiration token', () => {
    const { cache } = makeCache();
    const token = new ManualToken();

    const parent = cache.createEntry('parent');
    {
      const child = cache.createEntry('child');
      child.expirationTokens.push(token);
      child.value = 'child-value';
      child[Symbol.dispose]();
    }
    parent.value = 'parent-value';
    parent[Symbol.dispose]();

    expect(cache.get<string>('parent')).toBe('parent-value');

    token.fire();
    expect(cache.get('child')).toBeUndefined();
    expect(cache.get('parent')).toBeUndefined();
  });

  test('reading a token-expiring entry inside a pending parent links the parent to it', () => {
    const { cache } = makeCache();
    const token = new ManualToken();
    const dep = cache.createEntry('dep');
    dep.expirationTokens.push(token);
    dep.value = 'dep-value';
    dep[Symbol.dispose]();

    const parent = cache.createEntry('parent');
    expect(cache.get<string>('dep')).toBe('dep-value'); // the read propagates
    parent.value = 'parent-value';
    parent[Symbol.dispose]();

    token.fire();
    expect(cache.get('parent')).toBeUndefined();
  });

  test("a child's earlier absolute expiration is inherited by the parent", () => {
    const { cache, clock } = makeCache();

    const parent = cache.createEntry('parent');
    {
      const child = cache.createEntry('child');
      child.absoluteExpiration = new Date(clock.nowMs + 500);
      child.value = 1;
      child[Symbol.dispose]();
    }
    parent.value = 2;
    parent[Symbol.dispose]();

    clock.nowMs += 501;
    expect(cache.get('parent')).toBeUndefined();
  });

  test("a parent's own earlier absolute expiration is kept", () => {
    const { cache, clock } = makeCache();

    const parent = cache.createEntry('parent');
    parent.absoluteExpiration = new Date(clock.nowMs + 100);
    {
      const child = cache.createEntry('child');
      child.absoluteExpiration = new Date(clock.nowMs + 5_000);
      child.value = 1;
      child[Symbol.dispose]();
    }
    parent.value = 2;
    parent[Symbol.dispose]();

    clock.nowMs += 101;
    expect(cache.get('parent')).toBeUndefined();
    // The child keeps its own later deadline.
    expect(cache.get<number>('child')).toBe(1);
  });

  test('getOrCreate nests through the tracking window', () => {
    const { cache } = makeCache();
    const token = new ManualToken();

    const value = cache.getOrCreate('outer', () => {
      cache.set('inner', 'inner-value', token);
      // Reading inner inside outer's window links outer to inner's token.
      return `outer(${String(cache.get('inner'))})`;
    });

    expect(value).toBe('outer(inner-value)');
    token.fire();
    expect(cache.get('outer')).toBeUndefined();
  });

  test('no propagation when tracking is off', () => {
    const { cache } = makeCache(false);
    const token = new ManualToken();
    cache.set('dep', 'dep-value', token);

    const parent = cache.createEntry('parent');
    cache.get('dep');
    parent.value = 'parent-value';
    parent[Symbol.dispose]();

    token.fire();
    expect(cache.get('dep')).toBeUndefined();
    expect(cache.get<string>('parent')).toBe('parent-value');
  });

  test('a throwing getOrCreate factory still pops the pending chain and caches nothing', () => {
    const { cache } = makeCache();

    expect(() =>
      cache.getOrCreate('boom', () => {
        throw new Error('factory failed');
      })
    ).toThrow('factory failed');

    expect(cache.get('boom')).toBeUndefined();

    // The chain is clean: an unrelated read must not propagate to a wedged
    // pending entry (a wedge would surface as "parent" inheriting nothing --
    // assert by round-tripping a fresh linked pair).
    const token = new ManualToken();
    cache.set('dep', 1, token);
    const value = cache.getOrCreate('outer', () => cache.get('dep'));
    expect(value).toBe(1);
    token.fire();
    expect(cache.get('outer')).toBeUndefined();
  });

  test('an abandoned (valueless) entry still pops the pending chain', () => {
    const { cache } = makeCache();
    const token = new ManualToken();

    const abandoned = cache.createEntry('abandoned');
    abandoned[Symbol.dispose](); // never committed -- no value set

    // The chain is clean: a subsequent read propagates nowhere and works.
    cache.set('dep', 1, token);
    expect(cache.get<number>('dep')).toBe(1);
    expect(cache.get('abandoned')).toBeUndefined();

    const c: IMemoryCache = cache;
    expect(c.getCurrentStatistics()).toBeUndefined(); // stats off in this cache
  });
});
