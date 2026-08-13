// DistributedCacheSugarAugmentations over a hand-written IDistributedCache fake. After
// the §36/§48 many-implementers carve-out retirement (§80), the wrapper methods
// are merged onto IDistributedCache, so the fake binds them via an empty
// `extends IDistributedCache` beside its four primitive members; this test
// exercises the STANDALONE member surface.

import { DistributedCacheEntryOptions, DistributedCacheSugarAugmentations,
  type IDistributedCache } from '@rhombus-std/caching.core';
import { describe, expect, test } from 'bun:test';

/** A minimal in-process IDistributedCache: a Map of payloads, options recorded per set. */
// Binds the augmented `IDistributedCache` symbol onto the fake so the merged
// setString/getString (§80) are declared on it; never called here.
interface FakeDistributedCache extends IDistributedCache {}
class FakeDistributedCache implements IDistributedCache {
  public readonly store = new Map<string, Uint8Array>();
  public lastSetOptions: DistributedCacheEntryOptions | undefined;

  public get(key: string): Promise<Uint8Array | undefined> {
    return Promise.resolve(this.store.get(key));
  }

  public set(key: string, value: Uint8Array, options: DistributedCacheEntryOptions): Promise<void> {
    this.store.set(key, value);
    this.lastSetOptions = options;
    return Promise.resolve();
  }

  public refresh(_key: string): Promise<void> {
    return Promise.resolve();
  }

  public remove(key: string): Promise<void> {
    this.store.delete(key);
    return Promise.resolve();
  }
}

describe('DistributedCacheSugarAugmentations', () => {
  test('set applies the shared default options, and they are frozen', async () => {
    const cache = new FakeDistributedCache();
    const payload = new Uint8Array([1, 2, 3]);

    await DistributedCacheSugarAugmentations.set.call(cache, 'key', payload);

    expect(cache.store.get('key')).toBe(payload);
    const options = cache.lastSetOptions!;
    expect(options.absoluteExpiration).toBeUndefined();
    expect(options.absoluteExpirationRelativeToNow).toBeUndefined();
    expect(options.slidingExpiration).toBeUndefined();
    // The default-options singleton mirrors the reference's frozen
    // DefaultOptions: an implementation cannot mutate it through any setter.
    expect(() => {
      options.slidingExpiration = 1_000;
    }).toThrow('frozen');
    expect(() => {
      options.absoluteExpiration = new Date();
    }).toThrow('frozen');
    expect(() => {
      options.absoluteExpirationRelativeToNow = 1_000;
    }).toThrow('frozen');
  });

  test('setString/getString round-trip UTF-8, including non-ASCII', async () => {
    const cache = new FakeDistributedCache();

    await DistributedCacheSugarAugmentations.setString.call(cache, 'greeting', 'héllo ✓ caché');

    const stored = cache.store.get('greeting')!;
    expect(stored).toBeInstanceOf(Uint8Array);
    expect(stored.length).toBeGreaterThan('héllo ✓ caché'.length); // multi-byte
    expect(await DistributedCacheSugarAugmentations.getString.call(cache, 'greeting')).toBe('héllo ✓ caché');
  });

  test('setString passes explicit options through; omitted options fall back to the frozen default', async () => {
    const cache = new FakeDistributedCache();
    const options = new DistributedCacheEntryOptions();

    await DistributedCacheSugarAugmentations.setString.call(cache, 'a', 'x', options);
    expect(cache.lastSetOptions).toBe(options);

    await DistributedCacheSugarAugmentations.setString.call(cache, 'b', 'y');
    expect(cache.lastSetOptions).not.toBe(options);
    expect(() => {
      cache.lastSetOptions!.slidingExpiration = 1_000;
    }).toThrow('frozen');
  });

  test('getString on a missing key resolves undefined', async () => {
    const cache = new FakeDistributedCache();
    expect(await DistributedCacheSugarAugmentations.getString.call(cache, 'absent')).toBeUndefined();
  });

  test('standalone surface snapshot (member names)', () => {
    expect(Object.keys(DistributedCacheSugarAugmentations).toSorted()).toEqual(['getString', 'set', 'setString']);
  });
});
