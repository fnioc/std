// tryGetValue on a concrete MemoryCache: the convenience `CacheExtensions.tryGetValue`
// shares its name with IMemoryCache's own primitive, so it installs as a
// dispatcher that routes to the primitive (the two are runtime-identical — the
// wrapper only re-casts the value type). The method stays dot-callable and never
// recurses through the wrapper's own `cache.tryGetValue(key)` call.

import { MemoryCache, MemoryCacheOptions } from '@rhombus-std/caching.memory';
import { describe, expect, test } from 'bun:test';

describe('MemoryCache.tryGetValue (dispatched over the primitive)', () => {
  test('returns [false] on a miss and [true, value] on a hit — no recursion', () => {
    const cache = new MemoryCache(new MemoryCacheOptions());
    cache.set('a', 42);

    expect(cache.tryGetValue('missing')).toEqual([false]);
    expect(cache.tryGetValue('a')).toEqual([true, 42]);
  });
});
