// Black-box tests for the `MemoryCacheEntryExtensions` fluent wrappers (the
// ME.Caching.Abstractions `MemoryCacheEntryExtensions` port) -- both the
// standalone object-literal member form and the prototype method form the
// CLOSED-set install merges onto MemoryCacheEntryOptions, plus the end-to-end
// path: build a bag fluently, apply it to a live entry via `setOptions`.

import { CacheItemPriority, type ICacheEntry, MemoryCacheEntryExtensions, MemoryCacheEntryOptions,
  type PostEvictionDelegate } from '@rhombus-std/caching.core';
import { MemoryCache, MemoryCacheOptions } from '@rhombus-std/caching.memory';
import type { IChangeToken } from '@rhombus-std/primitives';
import { describe, expect, test } from 'bun:test';

function makeToken(): IChangeToken {
  return {
    hasChanged: false,
    activeChangeCallbacks: false,
    registerChangeCallback() {
      return { [Symbol.dispose]() {} };
    },
  };
}

describe('MemoryCacheEntryExtensions — standalone member form', () => {
  test('each member sets its option and returns the bag for chaining', () => {
    const options = new MemoryCacheEntryOptions();
    const token = makeToken();
    const callback: PostEvictionDelegate = () => {};
    const state = { tag: 'state' };

    const chained = MemoryCacheEntryExtensions.registerPostEvictionCallback(
      MemoryCacheEntryExtensions.addExpirationToken(
        MemoryCacheEntryExtensions.setSlidingExpiration(
          MemoryCacheEntryExtensions.setSize(
            MemoryCacheEntryExtensions.setPriority(options, CacheItemPriority.High),
            42,
          ),
          1_000,
        ),
        token,
      ),
      callback,
      state,
    );

    expect(chained).toBe(options);
    expect(options.priority).toBe(CacheItemPriority.High);
    expect(options.size).toBe(42);
    expect(options.slidingExpiration).toBe(1_000);
    expect(options.expirationTokens).toEqual([token]);
    expect(options.postEvictionCallbacks.length).toBe(1);
    expect(options.postEvictionCallbacks[0]?.evictionCallback).toBe(callback);
    expect(options.postEvictionCallbacks[0]?.state).toBe(state);
  });

  test('setAbsoluteExpiration discriminates ms-relative from absolute Date', () => {
    const relative = MemoryCacheEntryExtensions.setAbsoluteExpiration(new MemoryCacheEntryOptions(), 5_000);
    expect(relative.absoluteExpirationRelativeToNow).toBe(5_000);
    expect(relative.absoluteExpiration).toBeUndefined();

    const when = new Date(Date.now() + 60_000);
    const absolute = MemoryCacheEntryExtensions.setAbsoluteExpiration(new MemoryCacheEntryOptions(), when);
    expect(absolute.absoluteExpiration).toBe(when);
    expect(absolute.absoluteExpirationRelativeToNow).toBeUndefined();
  });

  test("invalid values throw the bag's own RangeErrors", () => {
    expect(() => MemoryCacheEntryExtensions.setSize(new MemoryCacheEntryOptions(), -1)).toThrow(RangeError);
    expect(() => MemoryCacheEntryExtensions.setSlidingExpiration(new MemoryCacheEntryOptions(), 0)).toThrow(
      RangeError,
    );
    expect(() => MemoryCacheEntryExtensions.setAbsoluteExpiration(new MemoryCacheEntryOptions(), -5)).toThrow(
      RangeError,
    );
  });
});

describe('MemoryCacheEntryExtensions — method form (CLOSED-set install)', () => {
  test('fluent method chain equals the standalone member form', () => {
    const token = makeToken();
    const callback: PostEvictionDelegate = () => {};
    const when = new Date(Date.now() + 60_000);

    const viaMethod = new MemoryCacheEntryOptions()
      .setPriority(CacheItemPriority.Low)
      .setSize(7)
      .setSlidingExpiration(2_000)
      .setAbsoluteExpiration(when)
      .addExpirationToken(token)
      .registerPostEvictionCallback(callback);

    const viaMember = MemoryCacheEntryExtensions.registerPostEvictionCallback(
      MemoryCacheEntryExtensions.addExpirationToken(
        MemoryCacheEntryExtensions.setAbsoluteExpiration(
          MemoryCacheEntryExtensions.setSlidingExpiration(
            MemoryCacheEntryExtensions.setSize(
              MemoryCacheEntryExtensions.setPriority(new MemoryCacheEntryOptions(), CacheItemPriority.Low),
              7,
            ),
            2_000,
          ),
          when,
        ),
        token,
      ),
      callback,
    );

    expect(viaMethod.priority).toBe(viaMember.priority);
    expect(viaMethod.size).toBe(viaMember.size);
    expect(viaMethod.slidingExpiration).toBe(viaMember.slidingExpiration);
    expect(viaMethod.absoluteExpiration).toBe(viaMember.absoluteExpiration!);
    expect(viaMethod.expirationTokens).toEqual(viaMember.expirationTokens as IChangeToken[]);
    expect(viaMethod.postEvictionCallbacks[0]?.evictionCallback).toBe(
      viaMember.postEvictionCallbacks[0]!.evictionCallback!,
    );
  });
});

describe('MemoryCacheEntryExtensions — end-to-end via setOptions', () => {
  test('a fluently built bag applies to a live cache entry', () => {
    const cache = new MemoryCache(new MemoryCacheOptions());
    const token = makeToken();
    const callback: PostEvictionDelegate = () => {};

    const options = new MemoryCacheEntryOptions()
      .setPriority(CacheItemPriority.NeverRemove)
      .setSize(3)
      .setSlidingExpiration(10_000)
      .addExpirationToken(token)
      .registerPostEvictionCallback(callback);

    const entry: ICacheEntry = cache.createEntry('key').setOptions(options);

    expect(entry.priority).toBe(CacheItemPriority.NeverRemove);
    expect(entry.size).toBe(3);
    expect(entry.slidingExpiration).toBe(10_000);
    expect(entry.expirationTokens).toEqual([token]);
    expect(entry.postEvictionCallbacks[0]?.evictionCallback).toBe(callback);
  });
});
